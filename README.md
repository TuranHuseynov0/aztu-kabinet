# AzTU LMS — Render yayım paketi

Bu qovluq yalnız yayımlanacaq mənbəni saxlayır. Şifrə, token, test hesabı və lokal istifadəçi profili daxil edilməyib. Desktopdakı işlək lokal layihə dəyişdirilməyib.

## Render-də ilk yayım

1. Bu qovluğu şəxsi GitHub deposuna yerləşdir.
2. Render: New → Web Service → həmin depo → Language: Docker.
3. Dockerfile Path: `./Dockerfile`; Docker Build Context: `.`; Health Check Path: `/health`.
4. Bir instance istifadə et. İlk yayımda Render-in `RENDER_EXTERNAL_URL` dəyişəni avtomatik götürülür; `PUBLIC_ORIGIN` yazmaq lazım deyil. Custom domen qoşulanda bu dəyişənə yeni HTTPS ünvanı yazılır. `PORT=8080` verilə bilər.
5. Deploy et; əvvəl müvəqqəti ünvanda giriş, fənnlər, material endirmə və tapşırıq seçimini yoxla. Universitetin serverdən gələn giriş sorğularını qəbul etməsi real yayımda ayrıca yoxlanmalıdır.

## Domen

Alınmış domenin DNS-ni idarə etmək lazımdır. `kabinet.aztu.site` üçün `aztu.site` domeninə sahib olmaq lazımdır. `aztu.edu.az` universitetə məxsusdur.

Render → Settings → Custom Domains bölməsinə domeni əlavə et. Domen provayderində Render-in göstərdiyi DNS qeydlərini əlavə et. Konkret qeydi Render-dən götür; IP ünvanı təxmin etmə. Domen təsdiqlənəndən sonra `PUBLIC_ORIGIN`-i yeni HTTPS ünvanına dəyişib yenidən deploy et. Render sertifikatı avtomatik idarə edir.

## İstismar

- Production rejimində `PUBLIC_ORIGIN` və ya Render-in avtomatik HTTPS ünvanı olmadan server başlamır. Yalnız bu ünvanın brauzer Origin-i qəbul edilir; Render-in öz hostname-i də host yoxlamasında qəbul edilir.
- Sessiya cookie-si HttpOnly, Secure, SameSite=Strict-dir. Swagger və OpenAPI publik rejimdə bağlıdır.
- Giriş üçün bütün instance üzrə dəqiqədə 30 sorğu limiti var. İstifadəçi sayı artsa limit və paylanmış sessiya saxlanması ayrıca uyğunlaşdırılmalıdır.
- Sessiyalar RAM-dadır və server restartında yenidən giriş lazımdır. Buna görə hazır paket tək instance üçündür.
- Profil şəkli, tema və şəxsi cədvəl brauzer yaddaşındadır. Yeni domenə keçəndə əvvəlki localhost yaddaşı avtomatik köçmür.
- Tapşırıq faylları universitetin API-sinə göndərilir; Render diskində daimi saxlanmır.
- Render Free instance boş qalanda dayana bilər; sabit istifadə üçün always-on plan seçilir. Plan və domen ödənişi provayderdə ayrıca təsdiqlənir.

## Lokal build

`.NET 10 SDK` ilə `dotnet publish AzTuLms.Api/AzTuLms.Api.csproj -c Release` işlət. Lokal rejim üçün `ASPNETCORE_ENVIRONMENT=Development` istifadə edilir. Mövcud Desktop versiyası ayrıca qalır.

Rəsmi sənədlər:
- https://render.com/docs/docker
- https://render.com/docs/custom-domains
- https://render.com/docs/free
- https://learn.microsoft.com/aspnet/core/host-and-deploy/docker/building-net-docker-images?view=aspnetcore-10.0
