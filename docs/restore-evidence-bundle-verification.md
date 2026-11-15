# بررسی بایت‌های شواهد بازیابی دادیار

این ابزار یک کنترل تکمیلی پس از تهیه manifest و امضای جداگانه اپراتور و بازبین است. چهار فایل واقعی را خارج از checkout می‌خواند و SHA-256 آن‌ها را با مقادیر داخل manifest مقایسه می‌کند:

- آرشیو بکاپ؛ سقف اندازه ۱ GiB
- فایل نشانگر بازیابی؛ سقف ۱ MiB
- گزارش Restore؛ سقف ۳۲ MiB
- خروجی آزمون اتصال دیتابیس؛ سقف ۱ MiB

نمونه اجرا:

node scripts/verify-restore-evidence-bundle.cjs --manifest /secure/restore.json --archive /secure/backup.archive --restored-marker /secure/restored-marker.txt --restore-log /secure/restore.log --database-probe /secure/database-probe.json

تمام مسیرها باید مطلق، canonical، خارج از Git checkout و فایل معمولی مستقل باشند. symlink، hard-link alias، FIFO، فایل تغییریافته حین خواندن، فایل تکراری و hash نامنطبق رد می‌شوند. آرشیو به‌صورت streaming hash می‌شود و در حافظه بارگذاری کامل نمی‌شود.

محدودیت مهم: نتیجه موفق فقط می‌گوید بایت‌های چهار فایل با hashهای manifest یکسان‌اند. این ابزار اصالت گزارش، صحت واقعی عملیات Restore، موفقیت معنایی آزمون دیتابیس، هویت واقعی امضاکنندگان یا مجوز انتشار را اثبات نمی‌کند. verifier امضا نیز تا زمان pin مستقل اثرانگشت کلیدها، هویت امضاکنندگان را تأییدشده اعلام نمی‌کند. نتیجه این ابزار هرگز deployment_authorized را true نمی‌کند.

فقط از داده ساختگی در آزمون‌ها استفاده می‌شود. آرشیو، لاگ خام، اطلاعات دیتابیس، کلید خصوصی یا داده موکل نباید وارد Git یا تیکت عمومی شوند.
