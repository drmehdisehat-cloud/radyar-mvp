# گواهی امضاشده بازبینی انسانی دادیار

این سازوکار فقط برای **دروازه کنترل انتشار** است و بازبینی محلی داخل صفحه آفلاین را به احراز هویت تبدیل نمی‌کند.

## قالب

فایل گواهی شامل دو عضو است:

- payload: داده‌ای که امضا می‌شود.
- signature: امضای Ed25519 روی UTF-8 خروجی canonical JSON با کلیدهای مرتب‌شده.

فیلدهای الزامی payload:

- schema: مقدار ثابت dadyar-human-review-attestation-v2
- issuer: شناسه صادرکننده‌ای که در trust store ثبت شده است.
- subject: شناسه بازبین در سامانه هویت مستقل.
- audience: مقدار ثابت dadyar-preview-release
- decision: فقط approved
- review_id: UUID نسخه ۴
- source_commit: SHA چهل‌رقمی commit بررسی‌شده
- source_blob_sha1: Git blob SHA-1 فایل دقیق `dadyar-preview/index.html` در همان commit
- artifact_sha256: SHA-256 بسته دقیق بررسی‌شده
- reviewed_at و expires_at: زمان UTC با میلی‌ثانیه
- nonce: سی‌ودو بایت تصادفی با base64url بدون padding

## Trust store

فایل trust store باید بیرون از checkout و با مالکیت و مجوز محدود نگهداری شود. فقط کلید عمومی Ed25519، شناسه subject، نقش preview-reviewer و وضعیت فعال در آن قرار می‌گیرد. کلید خصوصی هرگز نباید در مخزن، بسته پیش‌نمایش، گفتگو، گزارش CI یا cPanel قرار گیرد.

نگاشت کلید عمومی به هویت واقعی باید خارج از این مخزن و از مسیر قابل اعتماد مالک/سامانه هویت سازمانی ثبت و مستقلاً تأیید شود. این اسکریپت منشأ trust store یا هویت مدنی صاحب کلید را کشف نمی‌کند.

## اجرای read-only

نمونه ساختار فرمان:

node scripts/preview-release-preflight.cjs --restore-evidence /ABS/restore.json --destination-evidence /ABS/destination.json --review-attestation /ABS/review.json --review-trust-store /ABS/trust-store.json --expected-source-commit COMMIT_SHA --expected-artifact-sha256 ARTIFACT_SHA256 --isolated-restore-verified --mobile-browser-verified --zero-api-requests-verified --human-review-verified

تمام فایل‌های شواهد باید خارج از checkout باشند. امضا باید به همان commit، Git blob فایل HTML مقصد و SHA-256 بسته متصل باشد. تأیید منقضی، آینده‌دار، ردشده، متعلق به صادرکننده دیگر یا فاقد نقش مجاز رد می‌شود.

## محدودیت‌های مهم

- این ابزار فقط امضا، انطباق payload و نگاشت کلید در trust store ارائه‌شده را بررسی می‌کند.
- nonce تولید می‌شود، اما این ابزار پایگاه داده ضدبازپخش ندارد؛ در اتصال سروری باید review_id و nonce به‌صورت اتمیک مصرف و ثبت شود.
- امضای معتبر به‌تنهایی اثبات نمی‌کند که شخص واقعاً وکیل، متخصص حقوقی یا صاحب اختیار قانونی است.
- حتی نتیجه موفق این preflight مجوز استقرار نیست؛ بازیابی واقعی بکاپ، آزمون محیط مستقل، بررسی مقصد، HTTPS، امنیت، بررسی حقوقی و تأیید صریح مالک جداگانه لازم‌اند.
- هیچ API یا گفت‌وگوی هوشمند عمومی با این تغییر فعال نمی‌شود.
