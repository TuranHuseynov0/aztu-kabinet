using System.Text.Json;
using AzTuLms.Api;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
var configuredOrigin = (builder.Configuration["PUBLIC_ORIGIN"] ?? builder.Configuration["RENDER_EXTERNAL_URL"])?.Trim().TrimEnd('/');
var publicMode = !string.IsNullOrEmpty(configuredOrigin);
Uri? publicUri = null;
if (publicMode && (!Uri.TryCreate(configuredOrigin, UriKind.Absolute, out publicUri)
    || publicUri.Scheme != "https" || publicUri.AbsolutePath != "/"
    || publicUri.Query.Length != 0 || publicUri.Fragment.Length != 0 || publicUri.UserInfo.Length != 0))
    throw new InvalidOperationException("PUBLIC_ORIGIN must be an HTTPS origin, for example https://your-service.onrender.com");
var allowedHosts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
var allowedOrigins = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
if (publicMode)
{
    allowedHosts.Add(publicUri!.IdnHost);
    allowedOrigins.Add(publicUri.GetLeftPart(UriPartial.Authority));
    var renderHost = builder.Configuration["RENDER_EXTERNAL_HOSTNAME"];
    if (!string.IsNullOrWhiteSpace(renderHost)) allowedHosts.Add(renderHost);
    var rawPort = builder.Configuration["PORT"] ?? "8080";
    if (!int.TryParse(rawPort, out var port) || port is < 1024 or > 65535)
        throw new InvalidOperationException("PORT must be between 1024 and 65535.");
    var bindAddress = builder.Configuration["BIND_ADDRESS"] ?? "0.0.0.0";
    if (bindAddress != "0.0.0.0" && bindAddress != "127.0.0.1")
        throw new InvalidOperationException("Unsupported BIND_ADDRESS.");
    builder.WebHost.UseUrls($"http://{bindAddress}:{port}");
}
else
{
    if (!builder.Environment.IsDevelopment())
        throw new InvalidOperationException("PUBLIC_ORIGIN or Render external URL is required outside local Development mode.");
    allowedHosts.UnionWith(["127.0.0.1", "localhost"]);
    allowedOrigins.UnionWith(["http://127.0.0.1:5080", "http://localhost:5080"]);
    builder.WebHost.UseUrls("http://127.0.0.1:5080");
}
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddFixedWindowLimiter("login", limiter =>
    {
        limiter.PermitLimit = 30;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueLimit = 0;
        limiter.AutoReplenishment = true;
    });
});
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = LmsSession.MaxUploadBytes + 1_048_576);
builder.Services.Configure<FormOptions>(options => options.MultipartBodyLengthLimit = LmsSession.MaxUploadBytes + 1_048_576);
builder.Services.AddSingleton<SessionStore>();
builder.Services.AddSingleton(new TimetableCatalog(File.ReadAllText(Path.Combine(builder.Environment.ContentRootPath, "Data", "timetable.json"))));
var app = builder.Build();
const string cookieName = "aztu_local_session";

app.Use(async (context, next) =>
{
    context.Response.Headers.CacheControl = "no-store";
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    if (publicMode) context.Response.Headers["Strict-Transport-Security"] = "max-age=31536000";
    // Render health checks may use an internal Host; this endpoint exposes no account data.
    if (context.Request.Path == "/health" && HttpMethods.IsGet(context.Request.Method))
    {
        await context.Response.WriteAsJsonAsync(new { status = "ok" });
        return;
    }
    var host = context.Request.Host.Host;
    if (!allowedHosts.Contains(host))
    {
        context.Response.StatusCode = 403;
        return;
    }
    var origin = context.Request.Headers.Origin.ToString();
    if (origin.Length > 0 && !allowedOrigins.Contains(origin))
    {
        context.Response.StatusCode = 403;
        return;
    }
    context.Response.Headers.CacheControl = "no-store";
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    try { await next(context); }
    catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { }
    catch (TaskCanceledException) { await WriteError(context, 504, "Universitet API-si vaxtında cavab vermədi."); }
    catch (HttpRequestException) { await WriteError(context, 502, "Universitet API-si ilə əlaqə qurulmadı."); }
    catch (JsonException) { await WriteError(context, 502, "Universitet API-si gözlənilən JSON cavabını qaytarmadı."); }
});

app.UseRateLimiter();
app.UseDefaultFiles();
app.UseStaticFiles();
if (!publicMode) app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint("/openapi.json", "AzTU LMS Local API v1");
    options.DocumentTitle = "AzTU LMS — Local Swagger";
    options.ConfigObject.PersistAuthorization = false;
});
app.MapMethods("/", new[] { "GET", "HEAD" }, () => Results.File(Path.Combine(app.Environment.ContentRootPath, "wwwroot", "index.html"), "text/html"));
if (!publicMode) app.MapGet("/openapi.json", () => Results.Text(StudentFeatures.OpenApi(File.ReadAllText(Path.Combine(app.Environment.ContentRootPath, "openapi.json"))), "application/json"));
app.MapGet("/health", () => Results.Ok(new { status = "ok", mode = publicMode ? "hosted" : "local", upstreamTested = false }));

app.MapPost("/auth/login", async (LoginRequest request, HttpContext context, SessionStore store) =>
{
    if (string.IsNullOrWhiteSpace(request.UserId) || string.IsNullOrWhiteSpace(request.Password)
        || request.UserId.Length > 256 || request.Password.Length > 4096)
        return Results.Json(new { message = "İstifadəçi ID və şifrə tələb olunur." }, statusCode: 400);
    var userAgent = context.Request.Headers.UserAgent.ToString();
    if (string.IsNullOrWhiteSpace(userAgent) || userAgent.Length > 1024)
        return Results.Json(new { message = "Brauzer məlumatı (User-Agent) tələb olunur. Swagger-i brauzerdə aç." }, statusCode: 400);
    var session = LmsSession.Create(userAgent);
    UpstreamResult result;
    try { result = await session.LoginAsync(request, context.RequestAborted); }
    catch { session.Dispose(); throw; }
    if (!result.Success)
    {
        session.Dispose();
        return Results.Json(new { message = result.Message }, statusCode: result.StatusCode);
    }
    store.Remove(context.Request.Cookies[cookieName]);
    var id = store.Add(session);
    context.Response.Cookies.Append(cookieName, id, new CookieOptions
    {
        HttpOnly = true, Secure = publicMode, SameSite = SameSiteMode.Strict, IsEssential = true,
        Path = "/", MaxAge = TimeSpan.FromHours(2)
    });
    return Results.Ok(new { status = "success", userId = session.AuthenticatedUserId });
}).RequireRateLimiting("login");
app.MapGet("/auth/status", (HttpContext context, SessionStore store) =>
    Results.Ok(new { authenticated = store.Find(context.Request.Cookies[cookieName]) is not null,
        userId = store.Find(context.Request.Cookies[cookieName])?.AuthenticatedUserId }));
app.MapPost("/auth/logout", (HttpContext context, SessionStore store) =>
{
    store.Remove(context.Request.Cookies[cookieName]);
    context.Response.Cookies.Delete(cookieName, new CookieOptions { Path = "/", Secure = publicMode, HttpOnly = true, SameSite = SameSiteMode.Strict });
    return Results.Ok(new { status = "success", message = "Lokal sessiya bağlandı." });
});
app.MapGet("/api/lectures", (HttpContext ctx, SessionStore store) => Forward("lectures", ctx, store));
app.MapGet("/api/user-info", (HttpContext ctx, SessionStore store) => Forward("user-info", ctx, store));
app.MapGet("/api/profile", (HttpContext ctx, SessionStore store) => Forward("profile", ctx, store));
app.MapGet("/api/lectures/{lectureId:int}/tasks", (int lectureId, HttpContext ctx, SessionStore store) =>
    lectureId > 0 ? Forward($"lectures/{lectureId}/tasks", ctx, store)
                  : Task.FromResult<IResult>(Results.Json(new { message = "Dərs ID-si müsbət olmalıdır." }, statusCode: 400)));
app.MapGet("/api/lectures/{lectureId:int}/tasks/{taskId:int}", (int lectureId, int taskId, HttpContext ctx, SessionStore store) =>
    lectureId > 0 && taskId > 0 ? Forward($"lectures/{lectureId}/tasks/{taskId}", ctx, store)
                  : Task.FromResult<IResult>(Results.Json(new { message = "ID-lər müsbət olmalıdır." }, statusCode: 400)));
app.MapPost("/api/lectures/{lectureId:int}/tasks/{taskId:int}/submit", async (int lectureId, int taskId, HttpContext context, SessionStore store) =>
{
    var id = context.Request.Cookies[cookieName];
    var session = store.Find(id);
    if (session is null) return Results.Json(new { message = "Əvvəl POST /auth/login ilə daxil ol." }, statusCode: 401);
    // A custom header prevents cross-origin HTML form submissions. Foreign
    // origins are already rejected by middleware; no CORS permission is granted.
    if (context.Request.Headers["X-AzTU-Local-Request"] != "1")
        return Results.Json(new { message = "X-AzTU-Local-Request başlığı 1 olmalıdır." }, statusCode: 403);
    if (lectureId <= 0 || taskId <= 0 || !context.Request.HasFormContentType)
        return Results.Json(new { message = "Müsbət ID-lər və multipart/form-data tələb olunur." }, statusCode: 400);
    IFormCollection form;
    try { form = await context.Request.ReadFormAsync(context.RequestAborted); }
    catch (InvalidDataException) { return Results.Json(new { message = "Fayl ölçüsü və ya forma qəbul edilmir." }, statusCode: 400); }
    var file = form.Files.GetFile("file");
    if (file is null || form.Files.Count != 1)
        return Results.Json(new { message = "file sahəsində yalnız bir fayl seç." }, statusCode: 400);
    using var stream = file.OpenReadStream();
    var result = await session.SubmitFileAsync(lectureId, taskId, stream, file.FileName, file.Length, context.RequestAborted);
    if (result.StatusCode == 401)
    {
        store.Remove(id);
        context.Response.Cookies.Delete(cookieName, new CookieOptions { Path = "/", Secure = publicMode, HttpOnly = true, SameSite = SameSiteMode.Strict });
    }
    return result.Success ? Results.Content(result.Json!, "application/json; charset=utf-8", statusCode: result.StatusCode)
        : Results.Json(new { message = result.Message }, statusCode: result.StatusCode);
});
app.MapDelete("/api/lectures/{lectureId:int}/tasks/{taskId:int}/submit", async (int lectureId, int taskId, HttpContext context, SessionStore store) =>
{
    var id = context.Request.Cookies[cookieName];
    var session = store.Find(id);
    if (session is null) return Results.Json(new { message = "Əvvəl daxil ol." }, statusCode: 401);
    if (context.Request.Headers["X-AzTU-Local-Request"] != "1")
        return Results.Json(new { message = "Təsdiq başlığı tələb olunur." }, statusCode: 403);
    if (!int.TryParse(context.Request.Query["file"], out var order))
        return Results.Json(new { message = "Fayl nömrəsi tələb olunur." }, statusCode: 400);
    var result = await session.DeleteSubmissionAsync(lectureId, taskId, order, context.RequestAborted);
    if (result.StatusCode == 401)
    {
        store.Remove(id);
        context.Response.Cookies.Delete(cookieName, new CookieOptions { Path = "/", Secure = publicMode, HttpOnly = true, SameSite = SameSiteMode.Strict });
    }
    return result.Success ? Results.Content(result.Json!, "application/json; charset=utf-8")
        : Results.Json(new { message = result.Message }, statusCode: result.StatusCode);
});
app.MapGet("/api/attendance", (HttpContext ctx, SessionStore store) => Forward("attendance", ctx, store));
app.MapGet("/api/lectures/{lectureId:int}/attendance", (int lectureId, HttpContext ctx, SessionStore store) =>
    lectureId > 0 ? Forward($"lectures/{lectureId}/attendance", ctx, store)
                  : Task.FromResult<IResult>(Results.Json(new { message = "Dərs ID-si müsbət olmalıdır." }, statusCode: 400)));
app.MapGet("/api/lectures/{lectureId:int}/attendance-detail", (int lectureId, HttpContext ctx, SessionStore store) =>
    lectureId > 0 ? Forward($"lectures/{lectureId}/attendance-detail", ctx, store)
                  : Task.FromResult<IResult>(Results.Json(new { message = "Dərs ID-si müsbət olmalıdır." }, statusCode: 400)));
app.MapGet("/api/lectures/{lectureId:int}/syllabus", (int lectureId, HttpContext ctx, SessionStore store) =>
    lectureId > 0 ? Forward($"lectures/{lectureId}/syllabus", ctx, store)
                  : Task.FromResult<IResult>(Results.Json(new { message = "Dərs ID-si müsbət olmalıdır." }, statusCode: 400)));
app.MapGet("/api/timetable", async (HttpContext context, SessionStore store, TimetableCatalog catalog) =>
{
    var session = store.Find(context.Request.Cookies[cookieName]);
    if (session is null) return Results.Json(new { message = "Əvvəl daxil ol." }, statusCode: 401);
    if (context.Request.QueryString.HasValue)
        return Results.Json(new { message = "Cədvəl yalnız öz hesabının qrupuna uyğun göstərilir." }, statusCode: 400);
    var lectures = await session.GetAsync("lectures", context.RequestAborted);
    if (!lectures.Success) return Results.Json(new { message = lectures.Message }, statusCode: lectures.StatusCode);
    var own = catalog.ForLectures(lectures.Json!);
    return own is null
        ? Results.Json(new { message = "Hesabının qrupu üçün cədvəl müəyyən edilmədi." }, statusCode: 404)
        : Results.Json(own);
});
StudentFeatures.Map(app, Forward);
app.Run();

async Task<IResult> Forward(string path, HttpContext context, SessionStore store)
{
    var id = context.Request.Cookies[cookieName];
    var session = store.Find(id);
    if (session is null)
        return Results.Json(new { message = "Əvvəl POST /auth/login ilə daxil ol." }, statusCode: 401);
    var response = await session.GetAsync(path, context.RequestAborted);
    if (response.StatusCode == 401)
    {
        store.Remove(id);
        context.Response.Cookies.Delete(cookieName, new CookieOptions { Path = "/", Secure = publicMode, HttpOnly = true, SameSite = SameSiteMode.Strict });
        return Results.Json(new { message = "Universitet sessiyası bitib. Yenidən giriş et." }, statusCode: 401);
    }
    if (!response.Success)
        return Results.Json(new { message = response.Message }, statusCode: response.StatusCode);
    return Results.Content(response.Json!, "application/json; charset=utf-8");
}

static async Task WriteError(HttpContext context, int status, string message)
{
    if (context.Response.HasStarted) return;
    context.Response.StatusCode = status;
    await context.Response.WriteAsJsonAsync(new { message });
}
