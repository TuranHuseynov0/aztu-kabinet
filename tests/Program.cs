using System.Net;
using System.Text;
using System.Text.Json;
using AzTuLms.Api;

static void Check(bool value, string name)
{
    if (!value) throw new Exception(name);
    Console.WriteLine("PASS: " + name);
}
var handler = new FakeHandler();
using var session = new LmsSession(new HttpClient(handler) { BaseAddress = new("https://api-lms.aztu.edu.az/api/") });
Check((await session.GetAsync("lectures", default)).StatusCode == 401 && handler.Calls == 0, "Unauthenticated calls do not reach upstream");
handler.Response = "{\"status\":\"success\",\"token\":\"test-token\",\"user_id\":\"test-id\"}";
Check((await session.LoginAsync(new("test-id", "test-password"), default)).Success, "Login response accepted");
Check(handler.Url == "https://api-lms.aztu.edu.az/api/api-login" && handler.Method == HttpMethod.Post, "Verified login endpoint and POST method");
using (var credentials = JsonDocument.Parse(handler.Body!))
{
    Check(credentials.RootElement.GetProperty("user_id").GetString() == "test-id"
          && credentials.RootElement.GetProperty("password").GetString() == "test-password", "Correct upstream credential fields");
}
Check(handler.TimestampPresent, "Client timestamp sent for login");
handler.Response = "[{\"id\":\"4287\"}]";
Check((await session.GetAsync("lectures", default)).Json == handler.Response && handler.Auth == "Bearer test-token", "Bearer automatically forwarded and JSON preserved");
Check((await session.GetAsync("lectures/4287/syllabus", default)).Success, "Syllabus route supported");
Check((await session.GetAsync("attendance", default)).Success, "Personal attendance summary route supported");
handler.Response = """
{"attendance_groups":[{"dates":[{"id":1}],"students":[{"student_id":"test-id","attendance":[{"id":1,"status":"2"}]},{"student_id":"other-id"}]}],"student_scores":[{"student_id":"test-id","attendance_score":5},{"student_id":"other-id","attendance_score":9}]}
""";
var filtered = await session.GetAsync("lectures/4287/attendance-detail", default);
using (var own = JsonDocument.Parse(filtered.Json!))
{
    var group = own.RootElement.GetProperty("attendance_groups")[0];
    Check(group.GetProperty("students").GetArrayLength() == 1
        && group.GetProperty("students")[0].GetProperty("student_id").GetString() == "test-id"
        && own.RootElement.GetProperty("student_scores").GetArrayLength() == 1, "Attendance details and scores exclude all other students");
    Check(group.GetProperty("dates").GetArrayLength() == 1
        && group.GetProperty("students")[0].GetProperty("attendance")[0].GetProperty("status").GetString() == "2", "Dates and own absence status preserved");
}
var calls = handler.Calls;
Check(LmsSession.IsAllowedRead("scores/20261") && LmsSession.IsAllowedRead("lectures/4287/syllabus/plan?method=3")
      && LmsSession.IsAllowedRead("lectures/4287/materials/12")
      && LmsSession.IsAllowedRead("search?q=Ali%20Aliyev") && LmsSession.IsAllowedRead("/teacher-evaluation/my"),
      "Discovered student read routes allowed");
Check(!LmsSession.IsAllowedRead("lectures/4287/tasks/12/assign-scores")
      && !LmsSession.IsAllowedRead("admin") && !LmsSession.IsAllowedRead("search?q=test&role=admin")
      && !LmsSession.IsAllowedRead("lectures/4287/syllabus/plan?method=4"), "Admin, write, arbitrary query and unsupported method paths blocked");
handler.Response = "{\"students\":[{\"student_id\":\"test-id\",\"scores\":{}},{\"student_id\":\"other-id\",\"scores\":{}}],\"score_set\":{}}";
var personalScores = await session.GetAsync("lectures/4287/scores", default);
using (var ownScores = JsonDocument.Parse(personalScores.Json!))
    Check(ownScores.RootElement.GetProperty("students").GetArrayLength() == 1, "Course scores exclude other students");
calls = handler.Calls;
Check((await session.GetAsync("https://example.com", default)).StatusCode == 400 && handler.Calls == calls, "Arbitrary upstream paths blocked");
Check((await session.DownloadAsync("tasks", "../secret.pdf", default)).StatusCode == 400
      && handler.Calls == calls, "Download traversal rejected before upstream request");
handler.Response = "binary-file";
var download = await session.DownloadAsync("materials", "lecture one.pdf", default);
Check(download.Success && Encoding.UTF8.GetString(download.Bytes!) == "binary-file"
      && handler.Auth == "Bearer test-token" && handler.Url!.Contains("secure-download/materials/lecture"), "Download forwards bearer and preserves file bytes");
handler.Response = "{\"can_upload\":false,\"student_files\":[]}";
using (var taskList = JsonDocument.Parse(LmsSession.TaskRoutes("{\"tasks\":[{\"id\":12,\"subject_group_id\":4293}]}")))
    Check(taskList.RootElement.GetProperty("tasks")[0].GetProperty("local_submit_path").GetString() == "/api/lectures/4293/tasks/12/submit",
          "Lab upload uses task subject_group_id instead of parent lecture ID");
calls = handler.Calls;
Check((await session.SubmitFileAsync(4287, 12, new MemoryStream([1, 2]), "lab.pdf", 2, default)).StatusCode == 403
      && handler.Calls == calls + 1 && handler.Method == HttpMethod.Get, "Closed task never receives upload POST");
handler.Response = "{\"can_upload\":true,\"student_files\":[{\"filename\":\"old.pdf\"}]}";
Check((await session.SubmitFileAsync(4287, 12, new MemoryStream([1, 2]), "lab.pdf", 2, default)).StatusCode == 409,
      "Existing submission cannot be silently overwritten");
calls = handler.Calls;
Check((await session.SubmitFileAsync(4287, 12, new MemoryStream([1, 2]), "lab.exe", 2, default)).StatusCode == 400
      && handler.Calls == calls, "Unsupported file rejected before upstream request");
Check((await session.SubmitFileAsync(4287, 12, new MemoryStream([1, 2]), "lab.pdf", LmsSession.MaxUploadBytes + 1, default)).StatusCode == 400,
      "Oversized file rejected before upload");
handler.Responses.Enqueue("{\"can_upload\":true,\"student_files\":[]}");
handler.Responses.Enqueue("{\"status\":\"success\",\"message\":\"Uploaded\"}");
calls = handler.Calls;
Check((await session.SubmitFileAsync(4287, 12, new MemoryStream(Encoding.UTF8.GetBytes("test-document")), "lab.pdf", 13, default)).Success
      && handler.Calls == calls + 2, "One preflight GET and exactly one multipart submission");
Check(handler.Url == "https://api-lms.aztu.edu.az/api/lectures/4287/tasks/12/submit"
      && handler.Method == HttpMethod.Post && handler.Auth == "Bearer test-token"
      && handler.Body!.Contains("name=file1") && handler.Body.Contains("test-document")
      && handler.Body.Contains("application/pdf"), "Upload uses verified route, file1 field, file bytes and bearer");
handler.Response = "{\"can_upload\":true,\"student_files\":[],\"teacher_files\":[{\"order\":1,\"filename\":\"teacher.pdf\"}]}";
calls=handler.Calls;
Check((await session.DeleteSubmissionAsync(4287,12,1,default)).StatusCode==404 && handler.Calls==calls+1 && handler.Method==HttpMethod.Get, "Delete cannot target teacher files or absent own submission");
calls=handler.Calls;
Check((await session.DeleteSubmissionAsync(4287,12,0,default)).StatusCode==400 && handler.Calls==calls, "Invalid deletion order rejected before upstream");
handler.Responses.Enqueue("{\"student_files\":[{\"order\":1,\"filename\":\"own.pdf\"}]}");
handler.Responses.Enqueue("{\"message\":\"Deleted\"}");
Check((await session.DeleteSubmissionAsync(4287,12,1,default)).Success && handler.Method==HttpMethod.Delete && handler.Url!.EndsWith("/submit?file=1") && handler.Auth=="Bearer test-token" && handler.Body!.Contains("own.pdf"), "Confirmed deletion uses server-verified own filename and bearer");
handler.Status = HttpStatusCode.Unauthorized;
handler.Response = "{\"secret\":\"should-not-be-forwarded\"}";
var failure = await session.GetAsync("lectures", default);
Check(failure.StatusCode == 401 && failure.Json is null, "Upstream auth failure remains 401 with no raw response");
handler.Status = HttpStatusCode.Gone;
Check((await session.GetAsync("lectures/4287/exam-results", default)).StatusCode == 410, "Upstream removed endpoint status preserved");
handler.Status = HttpStatusCode.OK;
handler.Response = "{}";
handler.FailurePath = "notifications";
var overview = await session.OverviewAsync(null, default);
using (var combined = JsonDocument.Parse(overview.Json!))
    Check(combined.RootElement.GetProperty("data").GetProperty("lectures").ValueKind == JsonValueKind.Object
      && combined.RootElement.GetProperty("errors").GetProperty("notifications").GetProperty("status").GetInt32() == 404,
      "Combined overview keeps successful sections and reports individual failures");
handler.FailurePath = null;
handler.Response = "{\"status\":\"success\"}";
using var malformed = new LmsSession(new HttpClient(handler) { BaseAddress = new("https://api-lms.aztu.edu.az/api/") });
Check(!(await malformed.LoginAsync(new("id", "password"), default)).Success, "Missing token cannot create authenticated session");
using var store = new SessionStore();
var id = store.Add(session);
Check(store.Find(id) == session && store.Find("invalid") is null, "Sessions isolated by random IDs");
store.Remove(id);
Check(store.Find(id) is null, "Logout removes session");

var timetable = new TimetableCatalog("""
{"upperWeekMonday":"2026-10-26","groups":{"6223a1":{"lessons":[{"title":"Own class"}]},"6223a2":{"lessons":[{"title":"Other class"}]},"6526dd":{"lessons":[]}}}
""");
var ownTimetable = timetable.ForLectures("""[{"lecture_name":"6223a1_if-40134y_title"}]""");
Check(ownTimetable?["groups"]?.AsObject().Count == 1 && ownTimetable["groups"]?["6223a1"] is not null
    && !ownTimetable.ToJsonString().Contains("6223a2"), "Timetable response contains only the authenticated course group");
Check(timetable.ForLectures("""[{"lecture_name":"6223a2_if-40134y_title"}]""")?["groups"]?["6223a2"] is not null,
    "Timetable catalog does not reuse another account's selection");
Check(timetable.ForLectures("""[{"lecture_name":"6223a1_x"},{"lecture_name":"6223a2_x"}]""") is null,
    "Ambiguous groups fail closed");
Check(timetable.ForLectures("""[{"lecture_name":"9999x_unknown"}]""") is null
    && timetable.ForLectures("[]") is null, "Unknown or missing groups expose no timetable");
Check(timetable.ForLectures("""{"data":[{"subject_group":"6526dd_course"}]}""")?["groups"]?["6526dd"] is not null,
    "Wrapped lecture responses and double-degree group codes supported");

sealed class FakeHandler : HttpMessageHandler
{
    public string Response = "{}";
    public Queue<string> Responses = new();
    public HttpStatusCode Status = HttpStatusCode.OK;
    public string? FailurePath;
    public int Calls;
    public string? Url, Body, Auth;
    public HttpMethod? Method;
    public bool TimestampPresent;
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
    {
        Calls++; Url = request.RequestUri!.ToString(); Method = request.Method;
        Body = request.Content is null ? null : await request.Content.ReadAsStringAsync(token);
        Auth = request.Headers.Authorization?.ToString();
        TimestampPresent = request.Headers.Contains("X-Client-Time");
        var status = FailurePath is not null && request.RequestUri!.AbsolutePath.EndsWith(FailurePath) ? HttpStatusCode.NotFound : Status;
        return new(status) { Content = new StringContent(Responses.Count > 0 ? Responses.Dequeue() : Response, Encoding.UTF8, "application/json") };
    }
}
