# راهنمای اثبات بازیابی و مقصد staging دادیار

این رویه برای پیش‌نمایش آفلاین و داده ساختگی است. هیچ مرحله‌ای از آن فایل تولید، DNS، دیتابیس اصلی، شاخه main یا API عمومی را تغییر نمی‌دهد.

## مرز ابزار

- verify-preview-staging-evidence.cjs فقط شواهد محلی را می‌خواند؛ بکاپ را Restore نمی‌کند و چیزی Deploy نمی‌کند.
- sign-preview-staging-evidence.cjs فقط payload شواهد را با کلید خصوصی Ed25519 محلی امضا می‌کند؛ کلید خصوصی را چاپ، آپلود یا در مخزن ثبت نمی‌کند.
- موفقیت verifier به معنی مجوز انتشار نیست. Artifact باید همچنان NOT_READY بماند تا مجوز جداگانه مالک و آزمون HTTPS صادر شود.
- فایل evidence.json، مسیرهای مطلق، نام میزبان‌ها، fingerprint دیتابیس و امضاها را در مخزن یا PR بارگذاری نکنید.

## کار لازم در ایران‌هاست

۱. از پشتیبانی ایران‌هاست یک محیط مستقل با مسیر canonical خارج از Document Root تولید و خارج از Git checkout درخواست کنید. تغییر DNS لازم نیست؛ برای آزمون موقت از IP/Host header یا hosts محلی استفاده شود.

۲. یک دیتابیس و کاربر staging جداگانه بسازید. کاربر staging نباید به دیتابیس تولید دسترسی داشته باشد.

۳. بکاپ واقعی را در همان Sandbox بازیابی کنید. گزارش باید شامل زمان دارای timezone، کد خروج صفر، نتیجه بررسی فایل‌های بازیابی‌شده و یک sentinel در restore root باشد. صرف وجود فایل بکاپ یا برچسب Complete کافی نیست.

۴. از دیتابیس staging، فقط SELECT 1 اجرا کنید. fingerprint محیط staging و تولید را با SHA-256 شناسه غیرمحرمانه host/database-name بسازید؛ مقدار خام نام میزبان یا نام دیتابیس را در evidence ننویسید. دو fingerprint باید متفاوت باشند.

۵. Artifact بازبینی را از GitHub دانلود و SHA-256 آرشیو را ثبت کنید. فقط index.html و INTEGRITY.json را در پوشه مستقل staging/public/dadyar-preview/ قرار دهید. هیچ فایل دیگری در آن پوشه نباشد.

۶. مسیرهای stagingRoot، restoreRoot، destination، productionDocumentRoot و repositoryRoot را با realpath بررسی کنید. هیچ‌یک از اجزای مسیر نباید symlink باشد. staging نباید با production یا checkout هم‌پوشانی داشته باشد.

## ساخت evidence محلی

یک فایل JSON محلی با این ساختار بسازید. مقادیر نمونه زیر ساختگی‌اند و نباید به‌عنوان گزارش واقعی استفاده شوند:

- payload.schemaVersion: عدد ۱
- payload.sourceCommit: SHA کامل ۴۰ نویسه‌ای Commit داخل INTEGRITY.json
- payload.environment: شامل kind برابر isolated-staging و مسیرهای canonical محیط staging، Document Root تولید و checkout
- payload.backup: مسیر و SHA-256 آرشیو واقعی، مسیر restore root، مسیر و SHA-256 sentinel، restoreExitCode برابر صفر و restoreCompletedAt با timezone
- payload.previewArtifact: مسیر آرشیو دانلودشده و SHA-256 آن
- payload.databaseProbe: success برابر true، query برابر SELECT 1، value برابر ۱، دو fingerprint متفاوت و testedAt دارای timezone
- payload.destination: مسیر پوشه staging و دو عضو دقیق index.html و INTEGRITY.json همراه SHA-256 هر فایل
- attestations: ابتدا شیء خالی

کلیدهای خصوصی Ed25519 باید در اختیار دو شخص مستقل و روی دستگاه‌های مورد اعتماد خودشان بمانند. fingerprint کلیدهای عمومی باید از کانال خارج از این evidence، توسط مالک pin شده باشد.

## امضای دو نفره و اعتبارسنجی

هر امضاکننده، روی همان payload و نه روی بخش attestations امضا می‌زند:

node scripts/sign-preview-staging-evidence.cjs /absolute/path/evidence.json --role operator --private-key /secure/operator-ed25519.pem

node scripts/sign-preview-staging-evidence.cjs /absolute/path/evidence.json --role reviewer --private-key /secure/reviewer-ed25519.pem

سپس verifier را در محیط مورد اعتماد اجرا کنید. fingerprintها باید از فهرست مورد تأیید مالک گرفته شوند، نه از همان فایل evidence:

node scripts/verify-preview-staging-evidence.cjs /absolute/path/evidence.json --operator-public-key /secure/operator-ed25519.pub.pem --operator-fingerprint 64_HEX --reviewer-public-key /secure/reviewer-ed25519.pub.pem --reviewer-fingerprint 64_HEX

verifier هش آرشیو بکاپ، sentinel، Artifact و هر دو فایل مقصد را بازخوانی می‌کند؛ جدایی staging از production و checkout، تفاوت fingerprint دیتابیس، مسیر بدون symlink، Manifest متصل به Commit دقیق، امضای Ed25519 و تفاوت کلید اپراتور و بازبین را بررسی می‌کند.

## محدودیت و رابطه با ابزارهای Restore موجود

این verifier یک کنترل تکمیلی برای payload امضاشده و مقصد preview است؛ جایگزین زنجیره کامل Restore نیست. در شاخه اصلی آزمایشی، ابزارهای جداگانه‌تری برای بررسی بایت‌های آرشیو/لاگ/probe، اجرای probe فقط‌خواندنی MySQL و pin اثرانگشت امضاکنندگان وجود دارند: 
- PR 16: ابزارهای bundle و probe، اما PR بسیار بزرگ و Draft است؛
- PR 32: pin دو امضاکننده Restore، اما Draft و نیازمند بازبینی مستقل است.

تا زمانی که این ابزارها به یک برش کوچک و بازبینی‌شده منتقل و در CI همین نسخه اجرا نشده‌اند، خروجی این verifier به‌تنهایی برای اعلام Restore واقعی کافی نیست. از آن به‌عنوان release authorization استفاده نکنید.

## انتخاب Artifact برای staging

Artifact ساخته‌شده در رویداد pull_request ممکن است workflowCommit ادغامی GitHub را ثبت کند که با sourceCommit شاخه PR متفاوت است. چنین بسته‌ای برای staging رد می‌شود. فقط Artifact اجرای push روی همان شاخه بازبینی‌شده را انتخاب کنید که در INTEGRITY.json مقدار sourceCommit و workflowCommit دقیقاً برابر SHA همان شاخه باشد. آزمون CI این مرز را صریحاً کنترل می‌کند.

## بعد از نتیجه VERIFIED

VERIFIED فقط یعنی شواهد امضاشده و فایل‌های محلی با این قواعد تطبیق دارند. هنوز باید:

- HTTPS واقعی staging با هدرهای امنیتی و مسیر /dadyar-preview/ آزموده شود؛
- IdP واقعی بازبین و ابطال نشست در سرور مستقل آزمایش شود؛
- بازبینی حقوقی منابع اولیه و نسخه معتبر در تاریخ واقعه ثبت شود؛
- مجوز جداگانه و محدود مالک برای انتشار همان Artifact اخذ شود.

تا تکمیل همه موارد، API، گفت‌وگوی هوشمند عمومی و انتشار روی Document Root تولید خاموش می‌مانند.
