# Cloudflare yayımı

Canlı ünvan: https://aztu-kabinet.aztu-kabinet-cloudflare.workers.dev

Cloudflare Workers statik faylları birbaşa təqdim edir. Yalnız `/api/*`, `/auth/*` və `/health` Worker-i işə salır. Free planında Workers sorğuları hesab üzrə günə 100 000-dir; adi statik fayllar bu saydan ayrıdır. Durable Objects, CPU, saxlama və digər Free limitləri də ayrıca tətbiq olunur. Ödənişli plan tələb olunmur; sərhədlər aşılarsa xidmət məhdudlaşa bilər.

## Hazırlamaq və yoxlamaq

Bu qovluqda Node.js 24 və npm ilə:

```text
npm ci
npm run prepare-assets
npm test
npm run build
```

Əsas UI mənbəsi `../AzTuLms.Api/wwwroot`-dur. `prepare-assets` yalnız göstəriləcək HTML, CSS və skriptləri `public/` qovluğuna köçürür. Tam cədvəl kataloqu Worker paketinin daxilində qalır; statik fayl kimi yayılmır.

## Sessiyalar

- Hər sessiya üçün ayrıca SQLite Durable Object istifadə edilir; RAM-da qalmaqdan asılı deyil.
- Universitetin tokeni və cookie-ləri AES-GCM ilə şifrələnir. Şifrələmə hər obyektin ID-sinə bağlanır.
- `SESSION_KEY` Cloudflare secret kimi 64 kiçik hex simvoldan ibarət təsadüfi açardır. Bu açarı adi `vars`-a, repoya və ya brauzerə yazma.
- Sessiya 2 saatdan sonra alarm ilə silinir. Universitet tokeni daha əvvəl etibarsız olarsa yenidən giriş tələb edilir.
- Şifrə saxlanmır. İmtahan giriş məlumatı localStorage-a yazılmır; yalnız öz profilində tələb olunanda alınır və əvvəlcə maskalanır.
- Giriş limiti hər IP üçün dəqiqədə 30 cəhddir.

## Yayım

Rəsmi Wrangler OAuth axını ilə `account:read`, `user:read`, `workers_scripts:write` icazələri kifayətdir; Wrangler fon girişini özü əlavə edir. Şifrələmə açarı ilk yayımda `.env.production-secrets` adlı **gitignore edilən** fayldan verilib:

```text
npm run prepare-assets
npx wrangler deploy --secrets-file .env.production-secrets
```

Sonrakı yayımlarda `npm run deploy` mövcud Cloudflare secret-i saxlayır. Açarı dəyişmək mövcud sessiyaları etibarsız edir. `.dev.vars` yalnız lokal inkişaf açarı üçündür; production açarından ayrıdır.

## Davranış və yoxlama sərhədi

Lokal workerd mühitində real universitet hesabına giriş, davamiyyət və cədvəl yoxlanılıb. Avtomatik testlər saxta cavablarla yükləmə və silmə qaydalarını, yazıların təkrarlanmamasını, sessiyaların ayrılığını, şifrələməni və qrup məhdudiyyətini yoxlayır. Universitetə real sınaq faylı göndərilmir və mövcud fayllar silinmir. Canlı Cloudflare girişini istifadəçi özü yoxlayır.

Qayıb limitləri təqdim edilən cədvələ əsaslanır: 30/45/60/75/90/105 saat üçün 3/5/7/9/11/13 q/b. Naməlum saat üçün limit təxmin edilmir. Cari bal və yekun qiymət universitet cavabından olduğu kimi götürülür; ayrıca davamiyyət balı göstərilmir.

Rəsmi istinadlar: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Static assets](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [SQLite Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/).
