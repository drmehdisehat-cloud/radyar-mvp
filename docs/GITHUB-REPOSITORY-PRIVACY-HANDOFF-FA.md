# راهنمای رفع موانع Artifact و انتشار پیش‌نمایش دادیار

## آخرین مشاهده زنده، ۲۰۲۶-۱۱-۲۶ ساعت ۰۰:۰۹:۵۳ UTC

این بخش با خواندن مستقیم GitHub API و بدون تغییر main یا تنظیمات مخزن ثبت شده است.

- شاخه: `dadyar/ai-chat-private-20261101`
- HEAD شاخه: `1fcd96c81ea39ecdfd4c0671cc62cf07806ec9c9`
- فایل پیش‌نمایش: `dadyar-preview/index.html`؛ Git Blob SHA-1: `6c48d116ecfccb111170f3aa9536572a2c3b3935`
- main: `d3f02e3b0d4cd3f5d40aabc63bd5d3d93d792318`
- اختلاف main...شاخه: ۱۸۸۲ کامیت جلوتر، صفر عقب‌تر.
- مخزن: `public`؛ شاخه آزمایشی: `protected=false` (پاسخ مستقیم Branch API).
- PRهای باز: ۲۶؛ هر ۲۶ مورد در فهرست خوانده‌شده Draft هستند. PR شماره ۱۷ به شاخه بازبینی `dadyar/preview-package-layout-review-base-20261117` متصل است، نه main.
- CI اصلی روی همین SHA: اجرای `45715727600` با نتیجه `success`؛ Jobهای `verify-existing-frontend` و `audit-release-posture-after-ci` موفق‌اند.
- بسته بازبینی عمومی روی همین SHA: اجرای `45715727669` با نتیجه `success`؛ Artifact شماره `15070061668`، اندازه ثبت‌شده GitHub برابر ۱۹٬۷۲۸ بایت، نام `dadyar-public-preview-review-1fcd96c81ea39ecdfd4c0671cc62cf07806ec9c9`.
- مشاهده مستقیم Branch API، `protected=false` را نشان می‌دهد؛ بنابراین حفاظت شاخه واقعاً غیرفعال است، نه صرفاً نامعلوم.
- اصلاح تاریخی `4d4f7530c47f438a1d89e18afef246cec026391f` و اجرای `42206234440` دوباره خوانده شدند؛ اجرای تاریخی `success` و متصل به همان SHA است.
- آزمون زنده دامنه از محیط اجرا به علت خطای DNS محلی (Temporary failure in name resolution) کامل نشد. این خطا اثبات قطعی قطعی‌بودن سایت یا DNS عمومی نیست؛ وضعیت HTTPS سایت در این مشاهده «تأییدنشده» است.

**تصمیم:** این مشاهده هیچ مجوز استقراری صادر نمی‌کند. تا Restore واقعی در Sandbox، احراز هویت مستقل بازبین، اعتبارسنجی مقصد، خصوصی‌سازی مخزن و حفاظت شاخه، `deployment_authorized=false` باقی می‌ماند.

---

مشاهده تاریخی قبلی (برای سابقه، نه وضعیت جاری): 2026-11-25T11:42Z
HEAD آن مشاهده تاریخی: db66fed3764f46942421e91c9a706833fff37ba3

## تفکیک دو Workflow و دو نوع Artifact

دو Workflow زیر رفتار متفاوت دارند و نباید نتیجه یکی به دیگری تعمیم داده شود:

1. فایل .github/workflows/ci.yml در اجرای 45606730101 روی HEAD دقیق بالا موفق شد. گام «Create public-only preview payload artifact» در این Workflow به‌دلیل عمومی‌بودن مخزن Skip شد. ممیزی همان اجرا مقدارهای visibility=public و branchProtected=false را ثبت کرد.
2. فایل .github/workflows/public-preview-review-artifact.yml در اجرای 45606730041 روی همان HEAD موفق شد و یک Artifact بازبینی عمومی با شناسه 15018910288 ساخت. اندازه ZIP برابر 19728 بایت و digest برابر e049a4c7a390050262cdf837d22f253d11a4aa9d0afea0f6e298815f60da07bf بود. این Workflow فقط index.html و INTEGRITY.json را بارگذاری کرد؛ پوشه handoff و فایل‌های اپراتور در بسته نبودند.

Artifact دوم واقعاً دانلود و استخراج شد. آزمون ZIP بدون خطا بود و دقیقاً دو فایل داشت:
- index.html: اندازه 65821 بایت، SHA-256 برابر fb31fa29491d3e087d1700a8a053305f3fce555c28728b6ebe0fba7ef822b327
- INTEGRITY.json: اندازه 967 بایت، SHA-256 برابر 9cb9fc9d65f85b1addc5f7c06c4696dc23b86598f975db3cfff46fb53852de21

Manifest به همان HEAD متصل است و صریحاً ثبت می‌کند:
- api_enabled=false
- public_ai_enabled=false
- reviewer_authentication=not-configured
- backup_restore_verified=false
- destination_verified=false
- deployment_authorized=false

بنابراین Artifact عمومیِ بازبینی، فقط بسته‌ای شامل دو فایل عمومی است؛ نه استقرار سایت است، نه احراز هویت بازبین را ثابت می‌کند و نه مجوز انتشار ایجاد می‌کند. شرط خصوصی‌بودن در Workflow اصلی CI را نباید با رفتار Workflow مستقلِ public-only review artifact یکی دانست.

## وضعیت زنده GitHub در همان اجرا

ممیزی read-only در اجرای 45606730101 این وضعیت را روی HEAD دقیق ثبت کرد:
- Visibility مخزن: public
- حفاظت شاخه آزمایشی: غیرفعال
- blockers: repository_must_be_private و release_branch_protection_disabled
- deploymentAuthorized=false

در اجرای اصلی، 1504 آزمون قراردادی و 19 آزمون مرورگر/موبایل موفق شدند؛ صفر شکست و صفر Skip. اجرای Artifact نیز همین مجموعه آزمون‌ها را پیش از ساخت و بارگذاری بسته اجرا کرد.

## اقدام مالک برای رفع مانع

1. پیش از هر تغییر، اعضا، تیم‌ها، یکپارچه‌سازی‌ها، GitHub Pages و وابستگی‌هایی را که به عمومی‌بودن مخزن متکی‌اند بررسی کنید.
2. تاریخچه Git و فایل‌های جاری را از نظر اسرار و اطلاعات شخصی بازبینی کنید. ممیزی خودکار موجود فقط امضاهای شناخته‌شده را جست‌وجو می‌کند و تضمین نبود افشا نیست. اگر credential یا داده محرمانه‌ای قبلاً commit شده، خصوصی‌کردن مخزن نسخه‌های clone/fork شده را پس نمی‌گیرد؛ credential افشاشده باید از مبدأ باطل و جایگزین شود.
3. اگر اثر تغییر بر همکاران و یکپارچه‌سازی‌ها پذیرفته شد، در GitHub به Settings → General → Danger Zone → Change repository visibility → Private بروید و تغییر را با حساب مالک تأیید کنید. این اقدام باید توسط مالک انجام شود؛ در این اجرا Visibility تغییر داده نشده است.
4. پس از خصوصی‌شدن مخزن، یک commit بی‌خطر روی همین شاخه آزمایشی push کنید تا Workflow اصلی CI دوباره اجرا شود. در همان Run، گام Artifact مخصوص مخزن خصوصی باید اجرا شود؛ سپس بسته را دانلود، استخراج و هش‌ها را تطبیق دهید.
5. پیش از بازکردن PR برای ادغام، یک بازبین مستقل باید diff را بررسی کند. PRهای فعلی بزرگ و Draft هستند؛ صرف سبز بودن CI مجوز ادغام نیست.

## حفاظت شاخه

برای شاخه dadyar/ai-chat-private-20261101 حفاظت فعال کنید:
- الزام موفقیت Dadyar stage-0 experimental CI / verify-existing-frontend
- الزام CI سخت‌گیرانه نسبت به base
- حداقل یک تأیید مستقل
- ابطال تأییدهای قدیمی پس از تغییر diff
- حل همه گفت‌وگوهای بازبینی
- منع Force-push و حذف شاخه
- اعمال حفاظت برای مدیران

این تنظیمات باید توسط مالک مخزن در GitHub انجام شوند؛ Workflow ممیزی فقط وضعیت را می‌خواند و تنظیمات را تغییر نمی‌دهد.

## مرز انتشار

خصوصی‌شدن مخزن فقط امکان تولید Artifact بازبینی را فراهم می‌کند؛ مجوز بارگذاری روی سایت نیست. تا وقتی Restore واقعی در Sandbox مستقل، اعتبارسنجی مقصد، TLS/HTTPS، احراز هویت بازبین، بررسی امنیت و حریم خصوصی، بازبینی منابع حقوقی و مجوز صریح همان انتشار ثبت نشده‌اند:
- backup_restore_verified=false
- destination_verified=false
- deployment_authorized=false
- API و گفت‌وگوی هوشمند عمومی خاموش می‌مانند.
- main، DNS، فایل‌ها و دیتابیس تولید نباید تغییر کنند.

## درخواست از ایران‌هاست

Sandbox مستقل خارج از Document Root تولید، دیتابیس و کاربر جداگانه، Restore واقعی فایل‌ها و دیتابیس، گزارش خروجی Restore، مسیرهای canonical/realpath، SHA-256 آرشیو و فایل نشانگر بازیابی‌شده و آزمون اتصال دیتابیس لازم است. صرف وجود یا Complete بودن فایل 140.38 مگابایتی کافی نیست. اگر پنل فقط Restore درجا دارد، باید حساب یا محیط آزمایشی جداگانه درخواست شود.

پیش از عملیات، از پشتیبانی ایران‌هاست کتبی بپرسید:
1. کنترل‌پنل متصل به همین سرویس دقیقاً cPanel است یا SolidCP یا کنترل‌پنل دیگر.
2. فایل بکاپ دقیقاً چه قالب و نوعی دارد و با کدام ابزار و نسخه قابل بازیابی است.
3. آیا Restore به حساب میزبانی یا Sandbox جداگانه پشتیبانی می‌شود.
4. مسیر canonical مقصد آزمایشی و Document Root تولید چیست.

اگر فایل بکاپ Full cPanel است، آن را با Full Restore روی حساب تولید بازیابی نکنید. اگر پلن فعلی Restore جداگانه ندارد، حساب آزمایشی مستقل یا Sandbox از پشتیبانی درخواست شود.

## شواهدی که مالک باید خارج از Git نگهداری کند

- شناسه و زمان ایجاد بکاپ، اندازه دقیق بایت و SHA-256 آرشیو دانلودشده.
- backup_provider=iranhost، source_site_origin=https://mehdisehat.ir، backup_id صادرشده توسط میزبان و backup_created_at در UTC.
- archive_size_bytes برابر با تعداد بایت آرشیو دانلودشده.
- نوع بکاپ، روش و نسخه ابزار Restore، زمان اجرا و exit code.
- مسیر canonical محیط بازیابی و مسیر canonical Document Root تولید.
- نام دیتابیس و کاربر آزمایشی، متفاوت از تولید؛ بدون درج گذرواژه.
- تعداد فایل‌ها، SHA-256 فایل نشانگر بازیابی‌شده و گزارش پالایش‌شده آزمون اتصال دیتابیس.
- SHA-256 گزارش Restore و نتیجه آزمون دیتابیس.
- تأیید اپراتور و بازبین مستقل با دو امضای Ed25519 جداگانه و اثرانگشت کلیدهای عمومی که از کانالی مستقل و مورد اعتماد مالک pin شده باشند.

تا زمانی که عملیات Restore واقعاً در محیط مستقل اجرا و توسط بازبین مستقل بررسی نشده است، restore_proven باید false بماند. ساختن JSON، کپی آرشیو، تطبیق اندازه یا هش به‌تنهایی اثبات Restore نیست.

## پس از بازیابی مستقل

1. فایل منبع باید از commit بازبینی‌شده و با Git Blob SHA-1 همان commit pin شود.
2. نسخه مقصد موقت را خارج از Git checkout و خارج از Document Root تولید قرار دهید.
3. فقط فایل staging را با دستور زیر اعتبارسنجی کنید؛ این دستور فایل را کپی یا منتشر نمی‌کند:

```sh
node scripts/verify-preview-destination.cjs \
  /ABSOLUTE/TRUSTED-CHECKOUT/dadyar-preview/index.html \
  /ABSOLUTE/ISOLATED-STAGING/dadyar-preview/index.html \
  /ABSOLUTE/PRODUCTION-DOCUMENT-ROOT \
  EXPECTED_REVIEWED_GIT_BLOB_SHA1
```

4. پس از تأیید Restore، فایل مقصد، بازبینی انسانی احراز هویت‌شده، آزمون موبایل و صفر بودن درخواست‌های شبکه/API، بازبینی امنیتی و حقوقی و مجوز صریح مالک، مرحله انتشار عمومی جداگانه بررسی می‌شود.
5. مرحله عمومی فقط مجاز است یک پوشه جدید dadyar-preview و یک فایل index.html ایجاد کند. هیچ فایل موجودی جایگزین یا حذف نشود؛ .htaccess، redirect، symlink یا فایل دیگری اضافه نشود.

## کپی کنترل‌شده پیش‌نمایش به محیط staging مستقل

پس از آنکه میزبان محیط staging جداگانه را ایجاد کرد و اپراتور Document Root تولید را به‌صورت canonical ثبت کرد، می‌توان فقط فایل پیش‌نمایش را در ریشه staging کپی کرد. این فرمان Restore انجام نمی‌دهد، مقصد تولید را نمی‌نویسد و مجوز انتشار صادر نمی‌کند:

```sh
node scripts/stage-preview-isolated.cjs \
  /ABSOLUTE/TRUSTED-CHECKOUT/dadyar-preview/index.html \
  /ABSOLUTE/ISOLATED-STAGING-ROOT \
  /ABSOLUTE/PRODUCTION-DOCUMENT-ROOT \
  EXPECTED_REVIEWED_GIT_BLOB_SHA1
```

- ریشه staging باید از قبل موجود، canonical، بدون symlink و غیرقابل‌نوشتن برای group/other باشد.
- مالکیت ریشه staging باید متعلق به همان UID کاربر سرویس اجراکننده باشد؛ اگر مالکیت قابل احراز نیست یا با UID سرویس متفاوت است، ابزار کپی باید fail-closed متوقف شود.
- ریشه staging باید در هر دو جهت از Document Root تولید و Git checkout جدا باشد.
- فرمان فقط یک مسیر جدید dadyar-preview/index.html می‌سازد؛ اگر پوشه از قبل وجود داشته باشد، هیچ فایلی را جایگزین نمی‌کند.
- پس از کپی، Git Blob SHA-1 و SHA-256 فایل مقصد با نسخه بازبینی‌شده تطبیق داده می‌شود.
- خروجی صریحاً deployment_authorized=false و restore_proven=false دارد؛ آزمون HTTPS زنده، احراز هویت بازبین و مجوز مالک همچنان جداگانه لازم‌اند.

ممنوع: Restore درجا روی حساب تولید، تغییر DNS، تغییر main، دستکاری دیتابیس تولید، فعال‌کردن API یا گفت‌وگوی هوشمند عمومی، و قرار دادن بکاپ یا اسرار در Git یا گفتگو.
