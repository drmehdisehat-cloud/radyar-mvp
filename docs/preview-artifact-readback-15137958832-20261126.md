# ثبت بازخوانی مستقل Artifact پیش‌نمایش دادیار

**نوع رکورد:** مشاهده تاریخیِ Artifact برای بازبینی، نه مجوز انتشار  
**زمان ثبت شواهد:** 2026-11-26T16:50:11Z  
**شاخه منبع:** `dadyar/preview-review-slice-20261126`  
**Commit منبع و گردش‌کار:** `5513fca9d35e0b712e2a6bdfb3072501c0f89fd7`

## زنجیره ساخت

- رویداد ساخت: `push`
- اجرای Push CI: [45861616298](https://github.com/drmehdisehat-cloud/radyar-mvp/actions/runs/45861616298)
- اجرای PR CI متناظر: [45861624092](https://github.com/drmehdisehat-cloud/radyar-mvp/actions/runs/45861624092)
- اجرای PR روی همان SHA موفق بود، اما مراحل ساخت/آپلود Artifact در رویداد `pull_request` عمداً Skip شدند. برای staging فقط Artifact رویداد Push با sourceCommit و workflowCommit یکسان قابل انتخاب است.
- Artifact ID: `15137958832`
- نام: `dadyar-preview-review-5513fca9d35e0b712e2a6bdfb3072501c0f89fd7`
- اندازه ZIP طبق GitHub: `17530` بایت
- SHA-256 آرشیو، مطابق digest متادیتای GitHub و بازحساب مستقل فایل دانلودشده: `03cefd03bc962e8e42f1e283112e8228ee80dd285e6774be0b332242281becbe`

## بازخوانی مستقل خارج از GitHub

آرشیو از GitHub دریافت و با ابزار ZIP استخراج شد:

- دقیقاً دو فایل: `index.html` و `INTEGRITY.json`
- اندازه `index.html`: `58088` بایت
- SHA-256 صفحه: `2bcd63edbeb1490032b92aacd384b28537e6eef33d90f882b3068b1f65bcc1c1`
- SHA-256 فایل Manifest: `b8e5e2b781ef062350017cd291646109b5c281f1327c3159d32d92c60b224304`
- مقدار `htmlSha256` در Manifest با هش مستقل صفحه برابر است.
- `sourceCommit` و `workflowCommit` هر دو با SHA کامل بالا برابرند.
- مسیر ثبت‌شده: `/dadyar-preview/`

## مرز انتشار در Manifest

مقادیر بازخوانی‌شده:

- `release.status = NOT_READY`
- `apiEnabled = false`
- `publicAiEnabled = false`
- `reviewerAuthentication = not-configured`
- `backupRestoreVerified = false`
- `destinationVerified = false`
- `deploymentAuthorized = false`

این Artifact صرفاً برای بازبینی محتوای استاتیک است. این رکورد نه Restore واقعی بکاپ را اثبات می‌کند، نه مقصد هاست را، نه هویت بازبین را و نه مجوز انتشار را. این مشاهده به Commit `5513fca` متصل است و با هر Commit جدید، Artifact جدید باید جداگانه ساخته و اعتبارسنجی شود.

## نتیجه آزمون Push CI

در لاگ اجرای Push CI:

- آزمون‌های قراردادی/مرز آفلاین/مسیر و شواهد: 47 موفق، صفر شکست، صفر Skip
- Chromium در viewport باریک: 1 موفق
- شبیه‌سازی دستگاه موبایل و HTTP subpath: 2 موفق
- مراحل ساخت، آپلود، دانلود مجدد و round-trip verifier: همگی موفق

این نتایج فقط آزمون CI روی GitHub Actions هستند؛ آزمون HTTPS یا Restore روی هاست ایران‌هاست نیستند.
