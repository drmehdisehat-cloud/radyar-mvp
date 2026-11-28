# راهنمای مشاهده وضعیت خصوصی‌بودن مخزن و حفاظت شاخه دادیار

تاریخ: ۱۴۰۵/۰۹/۰۲

## وضعیت مشاهده‌شده

در بررسی read-only این نوبت:

- مخزن `drmehdisehat-cloud/radyar-mvp` عمومی بود.
- شاخه `dadyar/ai-chat-private-20261101` مقدار `protected=false` داشت.
- جزئیات Branch Protection از اتصال فعلی با مجوز کافی خوانده نشد؛ این خطا نباید به‌عنوان موفقیت تعبیر شود.
- در نتیجه وضعیت انتشار `NOT_READY` است و هیچ مجوز استقراری صادر نمی‌شود.

## تنظیمات لازم در GitHub

مالک مخزن باید:

1. پس از بررسی وابستگی‌ها، Forkها، Pages، اعضا و تاریخچه، Visibility مخزن را به Private تغییر دهد.
2. برای شاخه آزمایشی `dadyar/ai-chat-private-20261101` حفاظت شاخه یا Ruleset معادل فعال کند.
3. Check اجباری دقیق را اضافه کند: `Dadyar stage-0 experimental CI / verify-existing-frontend` و حالت strict را فعال کند.
4. حداقل یک تأیید مستقل PR را اجباری و تأییدهای stale را باطل کند.
5. حفاظت را برای مدیران نیز اعمال کند.
6. Force-push و حذف شاخه را ممنوع و حل گفت‌وگوهای بازبینی را اجباری کند.

این تنظیمات باید توسط مالک در GitHub انجام شوند. هیچ رمز، کد ورود یا توکن نباید در گفتگو یا مخزن ثبت شود.

## تولید مشاهده تازه برای Preflight

پس از اعمال تنظیمات، مالک یا اپراتور مجاز می‌تواند روی ماشین امن خود، با یک GitHub token دارای مجوز read-only برای metadata، administration و checks:read، گزارش را تولید کند. توکن فقط در متغیر محیطی محلی قرار گیرد و هرگز چاپ یا commit نشود:

```sh
GITHUB_REPOSITORY=drmehdisehat-cloud/radyar-mvp \
GITHUB_TOKEN="$GITHUB_TOKEN" \
node scripts/audit-github-repository-posture.cjs > /secure/path/repository-posture.json

chmod 600 /secure/path/repository-posture.json
```

خروجی باید `status=POSTURE_VERIFIED`، `visibility=private`، `branchProtected=true` و `blockers=[]` داشته باشد. ممیزی همچنین آخرین Check Run با نام `verify-existing-frontend` را از GitHub می‌خواند و فقط نتیجه `completed/success` از اپ `github-actions` روی SHA دقیق HEAD را می‌پذیرد؛ نتیجه قدیمی، در حال اجرا، متعلق به SHA دیگر، اپ دیگر یا فهرست ناقص Check Runها مانع است. گزارش خطا، 403 یا `NOT_VERIFIED` قابل استفاده نیست.

در Preflight، فایل باید خارج از Git checkout و با مجوز مالک‌خواندنی باشد و با گزینه `--repository-posture-observation` معرفی شود. گزارش حداکثر ۱۵ دقیقه اعتبار دارد و `headSha` آن باید دقیقاً با `--expected-source-commit` برابر باشد؛ پس از هر commit تازه باید دوباره تولید شود. چون همین ممیزی درون job اصلی CI نیز اجرا می‌شود، Check Run همان job هنگام ممیزی هنوز `in_progress` است و عمداً پذیرفته نمی‌شود؛ برای مشاهده `POSTURE_VERIFIED` باید پس از اتمام CI، گزارش read-only را از یک اجرای مستقل دوباره تولید کرد.

این مشاهده فقط وضعیت تنظیمات GitHub را ثبت می‌کند؛ جایگزین Restore مستقل، اعتبارسنجی مقصد، احراز هویت بازبین، بررسی حقوقی یا تأیید نهایی مالک نیست. Preflight همچنان هیچ استقراری انجام نمی‌دهد.

## مرزهای تغییرناپذیر

تا زمان تکمیل تمام شروط:

- `main`، DNS، فایل‌های اصلی سایت و دیتابیس تولید تغییر نمی‌کنند.
- API و گفت‌وگوی هوشمند عمومی خاموش می‌مانند.
- بسته پیش‌نمایش فقط برای بررسی آفلاین است.
- هیچ لینک زنده‌ای بدون آزمون واقعی HTTPS و مسیر مقصد اعلام نمی‌شود.
