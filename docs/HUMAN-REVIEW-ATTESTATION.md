# گواهی امضاشده بازبینی انسانی دادیار

وضعیت: **نمونه فنی کنترل انتشار؛ نه احراز هویت فعال روی سایت**.

بازبینی محلی در صفحه آفلاین صرفاً یک تأیید رابط کاربری است. این تأیید، هویت بازبین را احراز نمی‌کند و به‌تنهایی اجازه دریافت گزارش یا انتشار نمی‌دهد.

## قالب گواهی

فایل گواهی شامل دو عضو است:

- `payload`: داده‌های دقیق بازبینی.
- `signature`: امضای Ed25519 روی UTF-8 خروجی canonical JSON با کلیدهای مرتب‌شده.

فیلدهای الزامی payload:

- `schema`: مقدار ثابت `dadyar-human-review-attestation-v2`
- `issuer`: شناسه صادرکننده ثبت‌شده در trust store
- `subject`: شناسه بازبین در سامانه هویت مستقل
- `audience`: مقدار ثابت `dadyar-preview-release`
- `decision`: فقط `approved`
- `review_id`: UUID نسخه ۴
- `source_commit`: SHA چهل‌رقمی commit بررسی‌شده
- `source_blob_sha1`: Git blob SHA-1 فایل دقیق `dadyar-preview/index.html` در همان commit
- `artifact_sha256`: SHA-256 بسته دقیق بررسی‌شده
- `reviewed_at` و `expires_at`: زمان UTC با میلی‌ثانیه
- `nonce`: سی‌ودو بایت تصادفی با base64url بدون padding

## Trust store و هویت

فایل trust store باید بیرون از checkout و با مالکیت و مجوز محدود نگهداری شود. فقط کلید عمومی Ed25519، شناسه subject، نقش `preview-reviewer` و وضعیت فعال در آن قرار می‌گیرد. کلید خصوصی هرگز نباید در مخزن، بسته پیش‌نمایش، گفتگو، گزارش CI یا cPanel قرار گیرد.

نگاشت کلید عمومی به هویت واقعی باید خارج از این مخزن و از مسیر قابل اعتماد مالک یا سامانه هویت سازمانی ثبت و مستقلاً تأیید شود. verifier فقط امضا و نگاشت کلید در trust store ارائه‌شده را بررسی می‌کند؛ هویت مدنی، استقلال سازمانی یا صلاحیت حرفه‌ای صاحب کلید را مستقلاً کشف نمی‌کند.

## فرمان read-only مطابق CLI فعلی

نمونه زیر نام تمام گزینه‌های لازم را مطابق `scripts/preview-release-preflight.cjs` نشان می‌دهد. مسیرها و اثرانگشت‌ها نمونه‌اند و باید با شواهد واقعی همان اجرای مستقل جایگزین شوند:

پیش از اجرا، مالک میزبان باید هش SHA-256 فایل trust store تأییدشده را خارج از فرمان و خارج از ورودی کاربر در محیط سرویس تنظیم کند: `DADYAR_REVIEW_TRUST_STORE_SHA256=64_HEX`. گزینه `--expected-review-trust-store-sha256` فقط برای کنترل تطابق با این مقدار است و به‌تنهایی ریشه اعتماد محسوب نمی‌شود.

```sh
node scripts/preview-release-preflight.cjs \
  --restore-evidence /secure/local/restore-manifest.json \
  --restore-archive /secure/local/backup.archive \
  --restore-marker /secure/isolated-restore/index.html \
  --restore-log /secure/local/restore.log \
  --restore-database-probe /secure/local/database-probe.json \
  --restore-operator-public-key /secure/local/operator-public.pem \
  --restore-operator-signature /secure/local/operator.sig \
  --restore-reviewer-public-key /secure/local/reviewer-public.pem \
  --restore-reviewer-signature /secure/local/reviewer.sig \
  --expected-restore-operator-public-key-sha256 64_HEX \
  --expected-restore-reviewer-public-key-sha256 64_HEX \
  --destination-evidence /secure/local/destination-evidence.json \
  --preview-source /ABSOLUTE/TRUSTED-CHECKOUT/dadyar-preview/index.html \
  --preview-destination /ABSOLUTE/ISOLATED-STAGING/dadyar-preview/index.html \
  --production-document-root /ABSOLUTE/PRODUCTION-DOCUMENT-ROOT \
  --expected-source-blob-sha1 40_HEX \
  --review-attestation /secure/local/review-attestation.json \
  --review-trust-store /secure/local/review-trust-store.json \
  --expected-source-commit 40_HEX \
  --expected-artifact-sha256 64_HEX \
  --expected-review-trust-store-sha256 64_HEX \
  --isolated-restore-verified \
  --mobile-browser-verified \
  --zero-api-requests-verified \
  --local-human-review-acknowledged
```

نکات مهم CLI:

- `DADYAR_REVIEW_TRUST_STORE_SHA256` باید خارج از ورودی فرمان و توسط مالک میزبان در محیط سرویس تنظیم شود؛ بدون آن، حتی گواهی امضاشده و هش ارائه‌شده در CLI رد می‌شوند.
- `--local-human-review-acknowledged` فقط اعلام می‌کند چک‌باکس بازبینی محلی در پیش‌نمایش آفلاین تأیید شده است؛ این گزینه احراز هویت یا امضای بازبین نیست.
- احراز بازبینی مستقل از طریق `--review-attestation` و `--review-trust-store` انجام می‌شود و گواهی به commit، Git blob و artifact دقیق متصل است. هش trust store باید از متغیر محیطی `DADYAR_REVIEW_TRUST_STORE_SHA256` که مالک در محیط سرویس تنظیم کرده pin شود؛ گزینه CLI صرفاً کنترل تطابق است.
- بازیابی بکاپ به چهار فایل واقعی آرشیو، نشانگر، گزارش Restore و probe دیتابیس نیاز دارد. دو امضای Ed25519 و اثرانگشت کلیدهای عمومی نیز باید از کانال مستقل مالک pin شوند.
- همه فایل‌های شواهد، trust store، امضاها و آرشیو باید بیرون از checkout و Document Root باشند. داده موکل، رمز، API Key و کلید خصوصی وارد Git یا گفتگو نشوند.
- گزینه‌های قدیمی `--human-review-verified` و `--authenticated-human-review-attested` در CLI فعلی معتبر نیستند و باید رد شوند.

## مرز سرور و ضدبازپخش

مخزن شامل `backend/signed-review-release-gate.cjs` و `backend/human-review-replay-ledger.cjs` است. ledger فعلی یک نمونه ضدبازپخش مبتنی بر فایل‌سیستم محلی و تک‌میزبانه است؛ آن را نباید پایگاه داده توزیع‌شده یا سرویس هویت مستقل فرض کرد.

`backend/review-release-http-handler.cjs` مرز HTTP را فراهم می‌کند، اما صریحاً به `backend/server.js` متصل نشده است. `backend/server.js` همچنان API توسعه‌ای loopback-only و فاقد احراز هویت عمومی است. هیچ‌یک از این اجزا در وضعیت فعلی مجوز فعال‌سازی API عمومی یا گفت‌وگوی هوشمند عمومی نیستند.

برای انتشار واقعی، مالک باید سامانه هویت مستقل، trust store و اثرانگشت‌های pin‌شده، سیاست استقلال بازبین، ذخیره‌ساز امن گزارش، ledger ضدبازپخش مناسب محیط اجرا، محدودسازی نرخ، TLS، ممیزی امنیتی و مجوز صریح همان انتشار را جداگانه تأمین و تأیید کند.

## تفسیر خروجی

- کد خروجی `1`: موانع ساختاری انتشار باقی است.
- کد خروجی `2`: ورودی یا فراخوانی نامعتبر است.
- کد خروجی `3`: شکل و سازگاری شواهد بررسی شده، اما اصالت مستقل، بررسی میزبان زنده، بازبینی حقوقی/امنیتی یا تأیید مالک هنوز کامل نیست.

این preflight فقط خواندنی است: فایل کپی نمی‌کند، درخواست شبکه نمی‌فرستد، انتشار انجام نمی‌دهد و هرگز `deployment_authorized=true` صادر نمی‌کند. حتی نتیجه موفق آن به‌تنهایی مجوز انتشار نیست.
