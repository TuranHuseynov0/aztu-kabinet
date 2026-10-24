using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Nodes;

namespace AzTuLms.Api;

public sealed record LoginRequest(
    [property: JsonPropertyName("user_id")] string? UserId,
    [property: JsonPropertyName("password")] string? Password);
public sealed record UpstreamResult(bool Success, int StatusCode, string Message, string? Json = null);
public sealed record DownloadResult(bool Success, int StatusCode, string Message, byte[]? Bytes = null);

public sealed class LmsSession(HttpClient client) : IDisposable
{
    private string? token;
    public string? AuthenticatedUserId { get; private set; }
    public static LmsSession Create(string userAgent)
    {
        var handler = new HttpClientHandler
        {
            CookieContainer = new CookieContainer(), UseCookies = true,
            AllowAutoRedirect = false, AutomaticDecompression = DecompressionMethods.All
        };
        var client = new HttpClient(handler)
        {
            BaseAddress = new Uri("https://api-lms.aztu.edu.az/api/"),
            Timeout = TimeSpan.FromSeconds(30)
        };
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        client.DefaultRequestHeaders.Add("Origin", "https://lms.aztu.edu.az");
        client.DefaultRequestHeaders.Referrer = new Uri("https://lms.aztu.edu.az/");
        // Upstream authentication requires a recognized client identity. Preserve
        // the actual caller's User-Agent across login and all subsequent requests.
        client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", userAgent);
        return new LmsSession(client);
    }
    public async Task<UpstreamResult> LoginAsync(LoginRequest credentials, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "api-login") { Content = JsonContent.Create(credentials) };
        request.Headers.Add("X-Client-Time", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString());
        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode) return Failure((int)response.StatusCode, true);
        if (!IsJson(response)) return Failure(502, true);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object
            || !root.TryGetProperty("status", out var status) || status.ValueKind != JsonValueKind.String || status.GetString() != "success"
            || !root.TryGetProperty("token", out var tokenValue) || tokenValue.ValueKind != JsonValueKind.String
            || string.IsNullOrWhiteSpace(tokenValue.GetString()))
            return new(false, 401, "Giriş uğursuzdur. ID və şifrəni yoxla.");
        var candidate = tokenValue.GetString()!;
        if (candidate.Length > 16384 || candidate.Any(char.IsWhiteSpace)) return Failure(502, true);
        if (!root.TryGetProperty("user_id", out var userId) || userId.ValueKind is not (JsonValueKind.String or JsonValueKind.Number))
            return Failure(502, true);
        var verifiedId = userId.ValueKind == JsonValueKind.String ? userId.GetString() : userId.GetRawText();
        if (string.IsNullOrWhiteSpace(verifiedId)) return Failure(502, true);
        AuthenticatedUserId = verifiedId;
        token = candidate;
        return new(true, 200, "Giriş uğurludur.");
    }
    public async Task<UpstreamResult> GetAsync(string path, CancellationToken cancellationToken)
    {
        if (token is null) return new(false, 401, "Giriş tələb olunur.");
        if (!IsAllowedRead(path))
            return new(false, 400, "Bu API yolu dəstəklənmir.");
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode) return Failure((int)response.StatusCode, false);
        if (!IsJson(response)) return Failure(502, false);
        var json = await response.Content.ReadAsStringAsync(cancellationToken);
        using var document = JsonDocument.Parse(json);
        if (path.EndsWith("/attendance-detail", StringComparison.Ordinal))
        {
            if (AuthenticatedUserId is null) return new(false, 401, "Tələbə hesabı təsdiqlənməyib. Yenidən giriş et.");
            json = OwnAttendanceOnly(json, AuthenticatedUserId);
        }
        if (path.StartsWith("lectures/", StringComparison.Ordinal) && path.EndsWith("/scores", StringComparison.Ordinal))
            json = OwnAttendanceOnly(json, AuthenticatedUserId!);
        if (path.EndsWith("/tasks", StringComparison.Ordinal)) json = TaskRoutes(json);
        return new(true, (int)response.StatusCode, "", json);
    }
    public static bool IsAllowedRead(string path) =>
        path is "lectures" or "user-info" or "attendance" or "tasks" or "scores" or "schedule"
            or "announcements" or "notifications" or "oral-exams" or "exam-results-all" or "exam-password"
        || System.Text.RegularExpressions.Regex.IsMatch(path,
            @"\A(?:lectures/[1-9][0-9]*/(?:syllabus(?:/plan\?method=[123]|/topic-file/[1-9][0-9]*)?|attendance|attendance-detail|scores|exam-results|tasks(?:/[1-9][0-9]*)?|materials(?:/[1-9][0-9]*)?)|(?:announcements|notifications)/[1-9][0-9]*(?:/data)?|scores/[A-Za-z0-9_-]{1,40}|exam-results/[1-9][0-9]*/questions|employees/[A-Za-z0-9_-]{1,80}|(?:search|search-all)\?q=(?:[A-Za-z0-9_.~-]|%[A-Fa-f0-9]{2}){1,1200}|/teacher-evaluation/(?:teachers|questions|my))\z");
    public async Task<UpstreamResult> OverviewAsync(int? lectureId, CancellationToken cancellationToken)
    {
        if (token is null) return new(false, 401, "Əvvəl daxil ol.");
        if (lectureId.HasValue && lectureId <= 0) return new(false, 400, "Dərs ID-si müsbət olmalıdır.");
        var paths = lectureId.HasValue
            ? new Dictionary<string, string>
            {
                ["syllabus"] = $"lectures/{lectureId}/syllabus", ["lecture_plan"] = $"lectures/{lectureId}/syllabus/plan?method=1",
                ["seminar_plan"] = $"lectures/{lectureId}/syllabus/plan?method=2", ["lab_plan"] = $"lectures/{lectureId}/syllabus/plan?method=3",
                ["materials"] = $"lectures/{lectureId}/materials", ["tasks"] = $"lectures/{lectureId}/tasks",
                ["scores"] = $"lectures/{lectureId}/scores", ["attendance"] = $"lectures/{lectureId}/attendance-detail"
            }
            : new Dictionary<string, string>
            {
                ["profile"] = "user-info", ["lectures"] = "lectures", ["attendance"] = "attendance", ["scores"] = "scores",
                ["tasks"] = "tasks", ["exam_results"] = "exam-results-all", ["oral_exams"] = "oral-exams",
                ["announcements"] = "announcements", ["notifications"] = "notifications"
            };
        var results = await Task.WhenAll(paths.Select(async entry =>
        {
            UpstreamResult result;
            try { result = await GetAsync(entry.Value, cancellationToken); }
            catch (HttpRequestException) { result = new(false, 502, "Universitet ilə əlaqə qurulmadı."); }
            catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested) { result = new(false, 504, "Sorğu vaxtı bitdi."); }
            catch (JsonException) { result = new(false, 502, "Gözlənilən JSON cavabı gəlmədi."); }
            return (entry.Key, Result: result);
        }));
        if (results.Any(entry => entry.Result.StatusCode == 401)) return new(false, 401, "Sessiya bitib. Yenidən giriş et.");
        var root = new JsonObject { ["fetched_at"] = DateTimeOffset.UtcNow.ToString("O") };
        var data = new JsonObject();
        var errors = new JsonObject();
        foreach (var entry in results)
            if (entry.Result.Success) data[entry.Key] = JsonNode.Parse(entry.Result.Json!);
            else errors[entry.Key] = new JsonObject { ["status"] = entry.Result.StatusCode, ["message"] = entry.Result.Message };
        root["data"] = data;
        root["errors"] = errors;
        return new(true, 200, "", root.ToJsonString());
    }
    public static string TaskRoutes(string json)
    {
        if (JsonNode.Parse(json) is not JsonObject root) throw new JsonException("Invalid task list.");
        if (root["tasks"] is JsonArray tasks)
            foreach (var task in tasks)
                if (task is JsonObject entry
                    && int.TryParse(entry["subject_group_id"]?.ToString(), out var groupId) && groupId > 0
                    && int.TryParse(entry["id"]?.ToString(), out var taskId) && taskId > 0)
                {
                    var path = $"/api/lectures/{groupId}/tasks/{taskId}";
                    entry["local_detail_path"] = path;
                    entry["local_submit_path"] = path + "/submit";
                }
        return root.ToJsonString();
    }
    public static string OwnAttendanceOnly(string json, string userId)
    {
        if (JsonNode.Parse(json) is not JsonObject root) throw new JsonException("Invalid attendance response.");
        if (root["attendance_groups"] is JsonArray groups)
            foreach (var group in groups)
                if (group is JsonObject entry && entry["students"] is JsonArray students)
                    RemoveOthers(students, userId);
        if (root["student_scores"] is JsonArray scores) RemoveOthers(scores, userId);
        if (root["students"] is JsonArray studentsAtRoot) RemoveOthers(studentsAtRoot, userId);
        return root.ToJsonString();
    }
    public async Task<DownloadResult> DownloadAsync(string category, string name, CancellationToken cancellationToken)
    {
        if (token is null) return new(false, 401, "Əvvəl daxil ol.");
        if (category is not ("materials" or "tasks" or "student-tasks" or "announcements" or "notifications")
            || string.IsNullOrWhiteSpace(name) || name.Length > 240 || name is "." or ".."
            || name.Any(c => char.IsControl(c) || c is '/' or '\\' or ':'))
            return new(false, 400, "Fayl kateqoriyası və adı qəbul edilmir.");
        using var request = new HttpRequestMessage(HttpMethod.Get, $"secure-download/{category}/{Uri.EscapeDataString(name)}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var failure = Failure((int)response.StatusCode, false);
            return new(false, failure.StatusCode, failure.Message);
        }
        const int limit = 50 * 1024 * 1024;
        if (response.Content.Headers.ContentLength > limit) return new(false, 413, "Lokal endirmə limiti 50 MB-dır.");
        await using var source = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var destination = new MemoryStream();
        var buffer = new byte[81920];
        int count;
        while ((count = await source.ReadAsync(buffer, cancellationToken)) > 0)
        {
            if (destination.Length + count > limit) return new(false, 413, "Lokal endirmə limiti 50 MB-dır.");
            await destination.WriteAsync(buffer.AsMemory(0, count), cancellationToken);
        }
        return new(true, 200, "", destination.ToArray());
    }
    public const long MaxUploadBytes = 20L * 1024 * 1024;
    public async Task<UpstreamResult> DeleteSubmissionAsync(int lectureId, int taskId, int order, CancellationToken cancellationToken)
    {
        if (token is null) return new(false, 401, "Əvvəl daxil ol.");
        if (lectureId <= 0 || taskId <= 0 || order <= 0) return new(false, 400, "Dərs, tapşırıq və fayl nömrəsi müsbət olmalıdır.");
        var path = $"lectures/{lectureId}/tasks/{taskId}";
        var details = await GetAsync(path, cancellationToken);
        if (!details.Success) return details;
        using var parsed = JsonDocument.Parse(details.Json!);
        string? name = null;
        if (parsed.RootElement.TryGetProperty("student_files", out var files) && files.ValueKind == JsonValueKind.Array)
            foreach (var item in files.EnumerateArray())
                if (item.TryGetProperty("order", out var itemOrder)
                    && int.TryParse(itemOrder.ToString(), out var value) && value == order
                    && item.TryGetProperty("filename", out var filename) && filename.ValueKind == JsonValueKind.String)
                    name = filename.GetString();
        if (string.IsNullOrWhiteSpace(name)) return new(false, 404, "Öz göndərişində bu fayl tapılmadı. Tapşırığı yenilə.");
        using var request = new HttpRequestMessage(HttpMethod.Delete, path + $"/submit?file={order}")
        { Content = JsonContent.Create(new { fileName = name }) };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode) return Failure((int)response.StatusCode, false);
        if (response.StatusCode == HttpStatusCode.NoContent)
            return new(true, 200, "", "{\"message\":\"Fayl silindi.\"}");
        if (!IsJson(response)) return Failure(502, false);
        var json = await response.Content.ReadAsStringAsync(cancellationToken);
        using var result = JsonDocument.Parse(json);
        return new(true, 200, "", json);
    }
    public async Task<UpstreamResult> SubmitFileAsync(int lectureId, int taskId, Stream file, string fileName, long length, CancellationToken cancellationToken)
    {
        if (token is null) return new(false, 401, "Əvvəl daxil ol.");
        if (lectureId <= 0 || taskId <= 0) return new(false, 400, "Dərs və tapşırıq ID-si müsbət olmalıdır.");
        if (length <= 0 || length > MaxUploadBytes) return new(false, 400, "Fayl boş olmamalı və 20 MB-dan böyük olmamalıdır.");
        var name = fileName.Replace('\\', '/').Split('/').Last();
        if (string.IsNullOrWhiteSpace(name) || name.Length > 200 || name.Any(char.IsControl))
            return new(false, 400, "Fayl adı qəbul edilmir.");
        var mediaType = Path.GetExtension(name).ToLowerInvariant() switch
        {
            ".pdf" => "application/pdf",
            ".doc" => "application/msword",
            ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".ppt" => "application/vnd.ms-powerpoint",
            ".pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            _ => null
        };
        if (mediaType is null) return new(false, 400, "PDF, DOC, DOCX, PPT və PPTX formatları dəstəklənir.");
        var taskPath = $"lectures/{lectureId}/tasks/{taskId}";
        var details = await GetAsync(taskPath, cancellationToken);
        if (!details.Success) return details;
        using var task = JsonDocument.Parse(details.Json!);
        if (!task.RootElement.TryGetProperty("can_upload", out var canUpload)
            || !(canUpload.ValueKind == JsonValueKind.True
                 || canUpload.ValueKind == JsonValueKind.Number && canUpload.GetRawText() == "1"
                 || canUpload.ValueKind == JsonValueKind.String && canUpload.GetString() == "1"))
            return new(false, 403, "Universitet bu tapşırığa fayl yükləməyə icazə vermir. Açıq tapşırıq seç.");
        if (task.RootElement.TryGetProperty("student_files", out var existing) && existing.ValueKind == JsonValueKind.Array
            && existing.EnumerateArray().Any(item => item.ValueKind == JsonValueKind.Object
                && item.TryGetProperty("filename", out var value) && value.ValueKind == JsonValueKind.String
                && !string.IsNullOrWhiteSpace(value.GetString())))
            return new(false, 409, "Bu tapşırıqda artıq fayl var. Mövcud işi avtomatik əvəz etmirik; dəyişdirmək üçün LMS-dən istifadə et.");
        using var content = new MultipartFormDataContent();
        var part = new StreamContent(file);
        part.Headers.ContentType = new MediaTypeHeaderValue(mediaType);
        content.Add(part, "file1", name);
        using var request = new HttpRequestMessage(HttpMethod.Post, taskPath + "/submit") { Content = content };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Headers.Add("X-Client-Time", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString());
        // Exactly one submission: never retry a potentially accepted upload.
        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            if ((int)response.StatusCode == 422) return new(false, 422, "Universitet faylı qəbul etmədi. Ölçü, format və tapşırıq şərtlərini yoxla.");
            if ((int)response.StatusCode == 413) return new(false, 413, "Universitetin fayl ölçüsü limiti aşılıb.");
            return Failure((int)response.StatusCode, false);
        }
        if (!IsJson(response)) return Failure(502, false);
        var json = await response.Content.ReadAsStringAsync(cancellationToken);
        using var parsed = JsonDocument.Parse(json);
        return new(true, (int)response.StatusCode, "", json);
    }
    private static void RemoveOthers(JsonArray entries, string userId)
    {
        for (var index = entries.Count - 1; index >= 0; index--)
            if (entries[index] is not JsonObject entry || entry["student_id"]?.ToString() != userId)
                entries.RemoveAt(index);
    }
    private static bool IsJson(HttpResponseMessage response) =>
        response.Content.Headers.ContentType?.MediaType is "application/json"
        || (response.Content.Headers.ContentType?.MediaType?.EndsWith("+json") ?? false);
    private static UpstreamResult Failure(int status, bool login) => status switch
    {
        401 => new(false, 401, login ? "ID və ya şifrə yanlışdır, yaxud giriş əlavə sessiya tələb edir." : "Universitet sessiyası bitib."),
        422 => new(false, 422, "Giriş məlumatları qəbul edilmədi. İstifadəçi ID və şifrəni yoxla."),
        403 => new(false, 403, "Universitet serveri girişi rədd etdi. Brauzer yoxlaması və ya əlavə giriş şərti tələb oluna bilər."),
        429 => new(false, 429, "Çox sorğu göndərilib. Bir az gözlə və yenidən yoxla."),
        404 => new(false, 404, "Universitet API-sində məlumat tapılmadı."),
        410 => new(false, 410, "Universitet bu API yolunu deaktiv edib. Ümumi imtahan nəticələri bölməsini yoxla."),
        >= 400 and < 500 => new(false, status, "Universitet bu sorğunu qəbul etmədi."),
        _ => new(false, 502, "Universitet API-si gözlənilən cavabı qaytarmadı.")
    };
    public void Dispose() { token = null; AuthenticatedUserId = null; client.Dispose(); }
}

public sealed class SessionStore : IDisposable
{
    private readonly ConcurrentDictionary<string, (LmsSession Session, DateTimeOffset Expires)> sessions = new();
    public string Add(LmsSession session)
    {
        foreach (var entry in sessions)
            if (entry.Value.Expires <= DateTimeOffset.UtcNow) Remove(entry.Key);
        var id = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        sessions[id] = (session, DateTimeOffset.UtcNow.AddHours(2));
        return id;
    }
    public LmsSession? Find(string? id)
    {
        if (id is null || !sessions.TryGetValue(id, out var entry)) return null;
        if (entry.Expires > DateTimeOffset.UtcNow) return entry.Session;
        Remove(id);
        return null;
    }
    public void Remove(string? id)
    {
        if (id is not null && sessions.TryRemove(id, out var entry)) entry.Session.Dispose();
    }
    public void Dispose() { foreach (var id in sessions.Keys) Remove(id); }
}
