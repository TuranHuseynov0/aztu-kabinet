using System.Text.Json.Nodes;

namespace AzTuLms.Api;

public sealed record StudentFeature(string LocalPath, string UpstreamPath, string Tag, string Description, string? Query = null);

public static class StudentFeatures
{
    public static readonly StudentFeature[] Catalog =
    [
        new("/api/tasks", "tasks", "Tapşırıqlar", "Bütün öz tapşırıqların"),
        new("/api/scores", "scores", "Qiymətlər", "Semestrlər üzrə transkript və xülasə"),
        new("/api/scores/{semester}", "scores/{semester}", "Qiymətlər", "Semestrin detalları; sem_code dəyərini scores cavabından götür"),
        new("/api/lectures/{lectureId}/scores", "lectures/{lectureId}/scores", "Qiymətlər", "Fənn üzrə yalnız öz balların və qiymətləndirmə bölgüsü"),
        new("/api/lectures/{lectureId}/syllabus/plan", "lectures/{lectureId}/syllabus/plan", "Dərs planı", "Mövzular: method 1 mühazirə, 2 seminar, 3 laboratoriya", "method"),
        new("/api/lectures/{lectureId}/syllabus/topic-file/{topicId}", "lectures/{lectureId}/syllabus/topic-file/{topicId}", "Dərs planı", "Mövzu faylı: file sahəsində data URL/base64 gəlir"),
        new("/api/lectures/{lectureId}/materials", "lectures/{lectureId}/materials", "Materiallar", "Dərsin material siyahısı"),
        new("/api/lectures/{lectureId}/materials/{materialId}", "lectures/{lectureId}/materials/{materialId}", "Materiallar", "Seçilən material və fayl məlumatları"),
        new("/api/announcements", "announcements", "Elanlar", "Hesabına açıq elanlar"),
        new("/api/announcements/{announcementId}", "announcements/{announcementId}", "Elanlar", "Elanın detalları"),
        new("/api/announcements/{announcementId}/data", "announcements/{announcementId}/data", "Elanlar", "Elana əlavə edilmiş məlumatlar və fayllar"),
        new("/api/notifications", "notifications", "Bildirişlər", "Hesabının bildirişləri"),
        new("/api/notifications/{notificationId}", "notifications/{notificationId}", "Bildirişlər", "Bildiriş detalı; LMS bunu oxunmuş kimi qeyd edə bilər"),
        new("/api/notifications/{notificationId}/data", "notifications/{notificationId}/data", "Bildirişlər", "Bildirişə əlavə edilmiş məlumatlar"),
        new("/api/exam-results-all", "exam-results-all", "İmtahanlar", "Bütün öz imtahan nəticələrin"),
        new("/api/exam-results/{examStudentId}/questions", "exam-results/{examStudentId}/questions", "İmtahanlar", "Öz imtahanının sualları; ID-ni exam-results-all cavabından götür"),
        new("/api/lectures/{lectureId}/exam-results", "lectures/{lectureId}/exam-results", "İmtahanlar", "Köhnə fənn üzrə nəticə yolu; universitet yoxlamada 410 qaytardı"),
        new("/api/oral-exams", "oral-exams", "İmtahanlar", "Şifahi və təkrar imtahan məlumatların; bilet götürmə əməliyyatı icra edilmir"),
        new("/api/exam-password", "exam-password", "İmtahanlar", "Öz tələbə hesabının imtahan giriş məlumatı; həssas cavabı paylaşma"),
        new("/api/schedule", "schedule", "Cədvəl", "Tətbiqdəki cədvəl yolu; universitet yoxlamada 404 qaytardı"),
        new("/api/search", "search", "Müəllimlər", "Portalın müəllim axtarışı; q ən azı 2 simvol", "q"),
        new("/api/search-all", "search-all", "Müəllimlər", "Portalın ümumi axtarışı; q ən azı 2 simvol", "q"),
        new("/api/employees/{employeeId}", "employees/{employeeId}", "Müəllimlər", "Axtarış nəticəsindəki uuid üzrə açıq müəllim profili"),
        new("/api/teacher-evaluation/teachers", "/teacher-evaluation/teachers", "Sorğu", "Qiymətləndirilən müəllimlər; universitet yolu yoxlamada 404 qaytardı"),
        new("/api/teacher-evaluation/questions", "/teacher-evaluation/questions", "Sorğu", "Sorğu sualları; universitet yolu yoxlamada 404 qaytardı"),
        new("/api/teacher-evaluation/my", "/teacher-evaluation/my", "Sorğu", "Öz sorğu vəziyyətin; universitet yolu yoxlamada 404 qaytardı")
    ];

    public static void Map(WebApplication app, Func<string, HttpContext, SessionStore, Task<IResult>> forward)
    {
        foreach (var feature in Catalog)
            app.MapGet(feature.LocalPath, async (HttpContext context, SessionStore store) =>
            {
                var path = feature.UpstreamPath;
                foreach (var pair in context.Request.RouteValues)
                {
                    var value = pair.Value?.ToString() ?? "";
                    var valid = pair.Key switch
                    {
                        "semester" => System.Text.RegularExpressions.Regex.IsMatch(value, @"\A[A-Za-z0-9_-]{1,40}\z"),
                        "employeeId" => System.Text.RegularExpressions.Regex.IsMatch(value, @"\A[A-Za-z0-9_-]{1,80}\z"),
                        _ => int.TryParse(value, out var id) && id > 0
                    };
                    if (!valid) return Results.Json(new { message = "Parametr qəbul edilmir." }, statusCode: 400);
                    path = path.Replace("{" + pair.Key + "}", Uri.EscapeDataString(value));
                }
                if (feature.Query is not null)
                {
                    var value = context.Request.Query[feature.Query].ToString().Trim();
                    if (feature.Query == "method" && value.Length == 0) value = "1";
                    if (feature.Query == "method" ? value is not ("1" or "2" or "3") : value.Length is < 2 or > 100)
                        return Results.Json(new { message = "Sorğu parametri qəbul edilmir." }, statusCode: 400);
                    path += "?" + feature.Query + "=" + Uri.EscapeDataString(value);
                }
                return await forward(path, context, store);
            });
        app.MapGet("/api/features", () => Results.Ok(Catalog.Select(item => new { path = item.LocalPath, category = item.Tag, description = item.Description })));
        app.MapGet("/api/student-overview", (HttpContext context, SessionStore store) => Overview(null, context, store));
        app.MapGet("/api/lectures/{lectureId:int}/overview", (int lectureId, HttpContext context, SessionStore store) => Overview(lectureId, context, store));
        app.MapGet("/api/secure-download/{category}/{filename}", async (string category, string filename, HttpContext context, SessionStore store) =>
        {
            var id = context.Request.Cookies["aztu_local_session"];
            var session = store.Find(id);
            if (session is null) return Results.Json(new { message = "Əvvəl daxil ol." }, statusCode: 401);
            var result = await session.DownloadAsync(category, filename, context.RequestAborted);
            if (result.StatusCode == 401)
            {
                store.Remove(id);
                context.Response.Cookies.Delete("aztu_local_session", new CookieOptions { Path = "/" });
            }
            return result.Success ? Results.File(result.Bytes!, "application/octet-stream", filename)
                : Results.Json(new { message = result.Message }, statusCode: result.StatusCode);
        });
    }
    private static async Task<IResult> Overview(int? lectureId, HttpContext context, SessionStore store)
    {
        var id = context.Request.Cookies["aztu_local_session"];
        var session = store.Find(id);
        if (session is null) return Results.Json(new { message = "Əvvəl daxil ol." }, statusCode: 401);
        var result = await session.OverviewAsync(lectureId, context.RequestAborted);
        if (result.StatusCode == 401)
        {
            store.Remove(id);
            context.Response.Cookies.Delete("aztu_local_session", new CookieOptions { Path = "/" });
        }
        return result.Success ? Results.Content(result.Json!, "application/json; charset=utf-8")
            : Results.Json(new { message = result.Message }, statusCode: result.StatusCode);
    }

    public static string OpenApi(string original)
    {
        var root = JsonNode.Parse(original)!.AsObject();
        var paths = root["paths"]!.AsObject();
        foreach (var feature in Catalog)
        {
            var parameters = new JsonArray();
            foreach (System.Text.RegularExpressions.Match match in System.Text.RegularExpressions.Regex.Matches(feature.LocalPath, @"\{([^}]+)\}"))
            {
                var name = match.Groups[1].Value;
                parameters.Add(Parameter(name, "path", true, name is "semester" or "employeeId" ? "string" : "integer"));
            }
            if (feature.Query is not null) parameters.Add(Parameter(feature.Query, "query", true, feature.Query == "method" ? "integer" : "string"));
            paths[feature.LocalPath] = new JsonObject { ["get"] = Operation(feature.Tag, feature.Description, parameters) };
        }
        paths["/api/features"] = new JsonObject { ["get"] = Operation("Sistem", "Əlavə edilən bölmələrin kataloqu", new JsonArray()) };
        paths["/api/student-overview"] = new JsonObject { ["get"] = Operation("Toplu məlumat", "Profil, dərslər, davamiyyət, ballar, tapşırıqlar, imtahanlar, elanlar və bildirişlər bir cavabda; uğursuz bölmələr errors altında", new JsonArray()) };
        paths["/api/lectures/{lectureId}/overview"] = new JsonObject { ["get"] = Operation("Toplu məlumat", "Dərsin sillabusu, 3 növ planı, materialları, tapşırıqları, öz balların və davamiyyətin bir cavabda", new JsonArray(Parameter("lectureId", "path", true, "integer"))) };
        var download = Operation("Fayllar", "Öz hesabına açıq faylı endir; adını API cavabındakı saxlanmış fayl adından götür. Lokal limit 50 MB.",
            new JsonArray(Parameter("category", "path", true, "string"), Parameter("filename", "path", true, "string")));
        download["parameters"]![0]!["schema"]!["enum"] = new JsonArray("materials", "tasks", "student-tasks", "announcements", "notifications");
        download["responses"]!["200"]!["content"] = new JsonObject { ["application/octet-stream"] = new JsonObject { ["schema"] = new JsonObject { ["type"] = "string", ["format"] = "binary" } } };
        paths["/api/secure-download/{category}/{filename}"] = new JsonObject { ["get"] = download };
        return root.ToJsonString();
    }
    private static JsonObject Parameter(string name, string location, bool required, string type) =>
        new() { ["name"] = name, ["in"] = location, ["required"] = required, ["schema"] = new JsonObject { ["type"] = type } };
    private static JsonObject Operation(string tag, string description, JsonArray parameters) =>
        new()
        {
            ["tags"] = new JsonArray(tag), ["summary"] = description, ["parameters"] = parameters,
            ["responses"] = new JsonObject
            {
                ["200"] = new JsonObject { ["description"] = "Universitet cavabı", ["content"] = new JsonObject { ["application/json"] = new JsonObject { ["schema"] = new JsonObject() } } },
                ["400"] = new JsonObject { ["description"] = "Parametr qəbul edilmir" },
                ["401"] = new JsonObject { ["description"] = "Əvvəl daxil ol" },
                ["403"] = new JsonObject { ["description"] = "Universitet icazə vermir" },
                ["404"] = new JsonObject { ["description"] = "Universitetdə məlumat və ya yol tapılmadı" },
                ["410"] = new JsonObject { ["description"] = "Universitet yolu deaktiv edib" }
            }
        };
}
