# راهنمای اثبات بازیابی و مقصد staging دادیار

این رویه برای پیش‌نمایش آفلاین و داده ساختگی است. هیچ مرحله‌ای از آن فایل تولید، DNS، دیتابیس اصلی، شاخه main یا API عمومی را تغییر نمی‌دهد.

## مرز ابزار

- verify-preview-staging-evidence.cjs فقط شواهد محلی را می‌خواند؛ بکاپ را Restore نمی‌کند و چیزی Deploy نمی‌کند.
- sign-preview-staging-evidence.cjs فقط payload شواهد را با کلید خصوصی Ed25519 محلی امضا می‌کند؛ کلید خصوصی را چاپ، آپلود یا در مخزن ثبت نمی‌کند.
- موفقیت verifier به معنی مجوز انتشار نیست. Artifact باید همچنان NOT_READY بماند تا مجوز جداگانه مالک و آزمون HTTPS صادر شود.
- فایل evidence.json، مسیرهای مطلق، نام میزبان‌ها، fingerprint دیتابیس و امضاها را در مخزن یا PR بارگذاری نکنید.

## تأیید نوع پنل و قالب بکاپ پیش از هر دستور

پیش از انتخاب روش Restore، مالک باید از پشتیبانی ایران‌هاست، در تیکت ثبت‌شده از داخل حساب احرازشده همان سرویس، پاسخ کتبی این موارد را بگیرد:

1. کنترل‌پنل متصل به همین سرویس دقیقاً **cPanel، SolidCP یا پنل دیگری** است؟ نام یا صفحه ورود عمومی میزبان، نوع پنل حساب mehdisehat.ir را ثابت نمی‌کند.
2. فایل بکاپ واقعی چه قالبی دارد، اندازه دقیق آن چند بایت است و کدام ابزار و نسخه برای بازیابی همان قالب پشتیبانی می‌شود؟
3. آیا میزبان می‌تواند بکاپ را در حساب موقت یا Sandbox مستقل بازیابی کند؟ آیا پلن فعلی فقط Restore درجا را پشتیبانی می‌کند؟
4. مسیر canonical محیط آزمایشی و Document Root تولید چیست و جداسازی فایل‌ها، دیتابیس و دسترسی خروجی چگونه اعمال می‌شود؟

تا دریافت پاسخ کتبی، هیچ فرمان مخصوص cPanel یا SolidCP و هیچ گزینه Restore اجرا نشود. اگر تنها روش موجود Restore درجا روی حساب تولید است، عملیات متوقف و از میزبان حساب آزمایشی/موقت مستقل درخواست شود. برچسب Complete، اندازه ۱۴۰٫۳۸ مگابایت، یا وجود فایل آرشیو جایگزین Restore واقعی نیست.

اگر مالک نشست تعاملی پنل یا دسترسی محدود staging ندارد، اقدام لازم این است که خودش از پنل احرازشده یک تیکت پشتیبانی ثبت کند و از ایران‌هاست بخواهد Sandbox، دیتابیس/کاربر جدا و دسترسی محدود SSH/SFTP یا اجرای Restore توسط اپراتور میزبان را فراهم کند. دسترسی تولید، DNS و دیتابیس اصلی نباید داده شود.

در تیکت یا مخزن، رمز عبور، OTP، توکن، کلید API، کلید خصوصی، اطلاعات اتصال دیتابیس یا داده واقعی موکل قرار نگیرد.

## کار لازم در ایران‌هاست

۱. از پشتیبانی ایران‌هاست یک محیط مستقل با مسیر canonical خارج از Document Root تولید و خارج از Git checkout درخواست کنید. تغییر DNS لازم نیست؛ برای آزمون موقت از IP/Host header یا hosts محلی استفاده شود.

۲. یک دیتابیس و کاربر staging جداگانه بسازید. کاربر staging نباید به دیتابیس تولید دسترسی داشته باشد.

۳. بکاپ واقعی را در همان Sandbox بازیابی کنید. گزارش باید شامل زمان دارای timezone، کد خروج صفر، نتیجه بررسی فایل‌های بازیابی‌شده و یک sentinel در restore root باشد. صرف وجود فایل بکاپ یا برچسب Complete کافی نیست.

۴. فقط پس از پایان Restore، از دیتابیس staging، SELECT 1 اجرا کنید. زمان آزمون باید اکیداً بعد از restoreCompletedAt باشد؛ آزمون هم‌زمان یا زودتر از پایان Restore رد می‌شود. هر دو زمان `restoreCompletedAt` و `testedAt` باید timestamp معتبر RFC 3339 با تاریخ تقویمی ممکن و منطقه زمانی صریح و معلوم باشند؛ متن‌های طبیعی، تاریخ ناممکن، offset خارج از محدوده و `-00:00` رد می‌شوند. fingerprint محیط staging و تولید را با SHA-256 شناسه غیرمحرمانه host/database-name بسازید؛ مقدار خام نام میزبان یا نام دیتابیس را در evidence ننویسید. دو fingerprint باید متفاوت باشند.

۵. Artifact بازبینی را از GitHub دانلود و SHA-256 آرشیو را ثبت کنید. فقط index.html و INTEGRITY.json را در پوشه مستقل staging/public/dadyar-preview/ قرار دهید. هیچ فایل دیگری در آن پوشه نباشد.

۶. مسیرهای stagingRoot، restoreRoot، destination، productionDocumentRoot و repositoryRoot را با realpath بررسی کنید. هیچ‌یک از اجزای مسیر نباید symlink باشد. staging نباید با production یا checkout هم‌پوشانی داشته باشد.

## ساخت evidence محلی

یک فایل JSON محلی با این ساختار بسازید. مقادیر نمونه زیر ساختگی‌اند و نباید به‌عنوان گزارش واقعی استفاده شوند:

- payload.schemaVersion: عدد ۱
- payload.sourceCommit: SHA کامل ۴۰ نویسه‌ای Commit داخل INTEGRITY.json
- payload.environment: شامل kind برابر isolated-staging و مسیرهای canonical محیط staging، Document Root تولید و checkout
- payload.backup: مسیر و SHA-256 آرشیو واقعی، مسیر restore root، مسیر و SHA-256 sentinel، restoreExitCode برابر صفر و restoreCompletedAt با timezone
- payload.previewArtifact: مسیر آرشیو دانلودشده و SHA-256 آن
- payload.databaseProbe: success برابر true، query برابر SELECT 1، value برابر ۱، دو fingerprint متفاوت و testedAt دارای timezone؛ زمان آزمون باید اکیداً بعد از backup.restoreCompletedAt باشد. آزمون هم‌زمان یا زودتر از پایان Restore رد می‌شود.
- payload.destination: مسیر پوشه staging و دو عضو دقیق index.html و INTEGRITY.json همراه SHA-256 هر فایل
- attestations: ابتدا شیء خالی

کلیدهای خصوصی Ed25519 باید در اختیار دو شخص مستقل و روی دستگاه‌های مورد اعتماد خودشان بمانند. fingerprint کلیدهای عمومی باید از کانال خارج از این evidence، توسط مالک pin شده باشد.

در سیستم‌های POSIX، فایل کلید خصوصی باید فایل معمولی، بدون symlink، با مسیر مطلق canonical و مجوز فایل `0600` باشد. ابزار امضاکننده این شرایط را کنترل می‌کند و کلید گروه‌خوان یا عمومی را رد می‌کند. پیش از امضا، مجوز فایل را با `chmod 600 /absolute/path/to/private-key.pem` محدود کنید. محتوای کلید یا مسیر حساس آن را در PR، لاگ یا گزارش عمومی قرار ندهید.

## امضای دو نفره و اعتبارسنجی

هر امضاکننده، روی همان payload و نه روی بخش attestations امضا می‌زند:

node scripts/sign-preview-staging-evidence.cjs /absolute/path/evidence.json --role operator --private-key /secure/operator-ed25519.pem

node scripts/sign-preview-staging-evidence.cjs /absolute/path/evidence.json --role reviewer --private-key /secure/reviewer-ed25519.pem

سپس verifier را در محیط مورد اعتماد اجرا کنید. fingerprintها باید از فهرست مورد تأیید مالک گرفته شوند، نه از همان فایل evidence:

node scripts/verify-preview-staging-evidence.cjs /absolute/path/evidence.json --operator-public-key /secure/operator-ed25519.pub.pem --operator-fingerprint 64_HEX --reviewer-public-key /secure/reviewer-ed25519.pub.pem --reviewer-fingerprint 64_HEX

verifier ابتدا امضای Ed25519 کل payload را با fingerprintهای مورد اعتماد بررسی می‌کند و فقط پس از موفقیت امضاها هر مسیر ارائه‌شده در evidence را باز می‌کند؛ بنابراین payload دست‌کاری‌شده پیش از هر دسترسی به فایل‌های مقصد رد می‌شود. سپس هش آرشیو بکاپ، sentinel، Artifact و هر دو فایل مقصد را بازخوانی می‌کند؛ فایل sentinel نیز باید regular file با شمارنده پیوند (nlink) برابر ۱ باشد تا hard link به یک فایل از پیش موجود نتواند به‌جای شاهد Restore جا زده شود؛ جدایی staging از production و checkout، تفاوت fingerprint دیتابیس، مسیر بدون symlink، Manifest متصل به Commit دقیق، امضای Ed25519 و تفاوت کلید اپراتور و بازبین را بررسی می‌کند. برای جلوگیری از hard link که می‌تواند فایل staging را به فایل تولید متصل کند، هر دو فایل مقصد باید regular file با شمارنده پیوند (nlink) برابر ۱ باشند؛ hard link به فایل تولید یا فایل دیگر رد می‌شود. خروجی دقیق آن EVIDENCE_MATCHED_NOT_RELEASE_AUTHORIZED است؛ هویت اشخاص و صحت واقعی عملیات Restore را مستقلاً احراز نمی‌کند و هرگز مجوز انتشار نمی‌دهد.

## محدودیت و رابطه با ابزارهای Restore موجود

این verifier یک کنترل تکمیلی برای payload امضاشده و مقصد preview است؛ جایگزین زنجیره کامل Restore نیست. در شاخه اصلی آزمایشی، ابزارهای جداگانه‌تری برای بررسی بایت‌های آرشیو/لاگ/probe، اجرای probe فقط‌خواندنی MySQL و pin اثرانگشت امضاکنندگان وجود دارند: 
- PR 16: ابزارهای bundle و probe، اما PR بسیار بزرگ و Draft است؛
- PR 32: pin دو امضاکننده Restore، اما Draft و نیازمند بازبینی مستقل است.

تا زمانی که این ابزارها به یک برش کوچک و بازبینی‌شده منتقل و در CI همین نسخه اجرا نشده‌اند، خروجی این verifier به‌تنهایی برای اعلام Restore واقعی کافی نیست. از آن به‌عنوان release authorization استفاده نکنید.

## انتخاب Artifact برای staging

Artifact ساخته‌شده در رویداد pull_request ممکن است workflowCommit ادغامی GitHub را ثبت کند که با sourceCommit شاخه PR متفاوت است. چنین بسته‌ای برای staging رد می‌شود. فقط Artifact اجرای push روی همان شاخه بازبینی‌شده را انتخاب کنید که در INTEGRITY.json مقدار sourceCommit و workflowCommit دقیقاً برابر SHA همان شاخه باشد. آزمون CI این مرز را صریحاً کنترل می‌کند.

## بعد از نتیجه VERIFIED

EVIDENCE_MATCHED_NOT_RELEASE_AUTHORIZED فقط یعنی شواهد امضاشده و فایل‌های محلی با این قواعد تطبیق دارند؛ این نتیجه نه هویت واقعی امضاکنندگان را اثبات می‌کند، نه اجرای واقعی Restore را و نه مجوز انتشار است. هنوز باید:

- HTTPS واقعی staging با هدرهای امنیتی و مسیر /dadyar-preview/ آزموده شود؛
- IdP واقعی بازبین و ابطال نشست در سرور مستقل آزمایش شود؛
- بازبینی حقوقی منابع اولیه و نسخه معتبر در تاریخ واقعه ثبت شود؛
- مجوز جداگانه و محدود مالک برای انتشار همان Artifact اخذ شود.

تا تکمیل همه موارد، API، گفت‌وگوی هوشمند عمومی و انتشار روی Document Root تولید خاموش می‌مانند.

## آزمون HTTPS مقصد staging (فقط خواندنی)

پس از استخراج Artifact دقیق رویداد push به یک پوشه محلی canonical و پیش از هر مجوز انتشار، از یک محیط مورد اعتماد اجرا کنید:

```sh
DADYAR_PREVIEW_STAGING_ORIGIN=https://STAGING-HOST node scripts/probe-preview-staging-http.cjs https://STAGING-HOST/dadyar-preview/ /absolute/path/to/dadyar-preview-artifact
```

پیش از اجرا، مقدار `DADYAR_PREVIEW_STAGING_ORIGIN` باید دقیقاً origin مجاز staging و بدون مسیر باشد؛ اسکریپت بدون این allowlist یا برای origin متفاوت، پیش از هر درخواست شبکه متوقف می‌شود. این مانع از هدف‌گیری تصادفی میزبان دیگری یا production می‌شود.

این probe فقط دو درخواست GET می‌فرستد: مسیر دقیق /dadyar-preview/ و فایل INTEGRITY.json همان پوشه. درخواست‌ها بدون Cookie/credential، بدون redirect و با cache محلی غیرفعال انجام می‌شوند. اسکریپت پاسخ ۲۰۰، HTTPS، Content-Type، CSP دقیقاً برابر meta سند، Cache-Control: no-store، X-Content-Type-Options: nosniff، Referrer-Policy: no-referrer، X-Robots-Tag، نبود Set-Cookie و برابری بایت‌به‌بایت هر دو فایل با Artifact محلی را بررسی می‌کند. هیچ API، مسیر دیگری یا عملیات نوشتنی فراخوانی نمی‌شود.

این آزمون جایگزین Restore مستقل، کنترل realpath و hard link، احراز هویت بازبین یا مجوز انتشار نیست. خروجی STAGING_HTTPS_PROBE_VERIFIED_NOT_RELEASE_AUTHORIZED صرفاً تطبیق HTTPS و دو فایل را ثابت می‌کند. اگر میزبان هدرهای لازم را ارائه نمی‌کند، مقصد باید تا پیکربندی محدود و آزمون مجدد منتشرنشده باقی بماند.
