# احراز هویت بازبین با کلید عمومی pin‌شده

**وضعیت: adapter قابل‌آزمایش با کلید و ادعاهای ساختگی؛ هنوز IdP یا نشست واقعی مالک پیکربندی نشده است.**

فایل \`backend/pinned-reviewer-jwt-authenticator.cjs\` یک assertion نشست بازبین با امضای RS256 را فقط با کلیدهای عمومی از پیش pin‌شده بررسی می‌کند. این ماژول login، صدور نشست، کشف JWKS، refresh token، TLS termination یا اتصال به سرور سایت را پیاده‌سازی نمی‌کند.

## قرارداد پیکربندی

- \`issuer\`: نشانی canonical با HTTPS که دقیقاً با claim مربوط به \`iss\` برابر باشد.
- \`audience\`: شناسه دقیق سرویس بازبینی پیش‌نمایش.
- \`keys\`: فهرست حداکثر ۱۶ کلید RSA عمومی SPKI با \`kid\` یکتا؛ کلید باید حداقل ۲۰۴۸ بیت باشد. واکشی شبکه‌ای یا اعتماد به \`kid\` ناشناخته وجود ندارد.
- \`now\`: ساعت قابل تزریق برای آزمون؛ در اجرا باید ساعت سیستم میزبان معتبر باشد.
- کوکی ثابت \`__Host-dadyar-review-session\` است. سرویس هویت بالادستی باید آن را با \`Secure\`, \`HttpOnly\`, \`Path=/\` و \`SameSite=Strict\` صادر کند.

JWT باید \`alg=RS256\`, \`typ=JWT\`, \`iss\`, \`sub\`, \`aud\`, \`iat\`, \`exp\`, \`roles\` و \`reviewer_independent=true\` داشته باشد. اگر audience چندگانه است، \`azp\` باید دقیقاً برابر audience مورد انتظار باشد. نقش \`preview-reviewer\` اجباری است. زمان عمر و تازگی توکن محدود است.

## اتصال آزمایشی به دروازه

\`\`\`js
const { createPinnedReviewerJwtAuthenticator } =
  require('./pinned-reviewer-jwt-authenticator.cjs');
const { createSignedReviewReleaseHttpServer } =
  require('./signed-review-release-http.cjs');

const authenticateReviewer = createPinnedReviewerJwtAuthenticator({
  issuer: process.env.DADYAR_REVIEWER_ISSUER,
  audience: 'dadyar-preview-review',
  keys: loadOwnerPinnedPublicKeys()
});

const server = createSignedReviewReleaseHttpServer({
  allowedOrigin: 'https://preview.example.test',
  authenticateReviewer,
  trustStore: loadOwnerPinnedReviewTrustStore(),
  expectedSourceCommit: REVIEWED_COMMIT,
  expectedSourceBlobSha1: REVIEWED_BLOB,
  expectedArtifactSha256: REVIEWED_REPORT_SHA256,
  ledgerDirectory: PRIVATE_EXTERNAL_LEDGER,
  loadReviewedReport
});

// فقط loopback؛ reverse proxy/TLS و احراز هویت واقعی باید جداگانه پیکربندی شوند.
server.listen(8787, '127.0.0.1');
\`\`\`

این قطعه نمونه قرارداد اتصال است، نه فایل تنظیمات آماده تولید. هیچ کلید خصوصی، توکن یا مقدار محرمانه نباید در مخزن یا CI قرار گیرد.

## محدودیت‌های لازم پیش از استفاده واقعی

1. مالک باید IdP یا سرویس هویت سازمانی را انتخاب و issuer، audience، claim نقش و claim استقلال را در آن تعریف کند.
2. کلید عمومی و trust store باید از کانالی مستقل به‌وسیله مالک pin شوند؛ دریافت کلید از همان درخواست یا از شبکه در این adapter مجاز نیست.
3. IdP باید کوکی میزبان‌محدود را با صفات امن صادر کند و چرخه عمر نشست، خروج و ابطال را مدیریت کند.
4. reverse proxy باید فقط از loopback به این سرور وصل شود؛ TLS معتبر، Origin دقیق و هدرهای امنیتی در محیط واقعی باید جداگانه آزموده شوند.
5. دفتر ضدبازپخش فعلی تک‌میزبانه و فایل‌محور است؛ برای چند worker/host به ذخیره‌ساز اتمیک و بادوام مشترک نیاز است.
6. هویت واقعی و استقلال حرفه‌ای بازبین باید خارج از ادعاهای توکن، توسط مالک و مسئول حقوقی احراز شود.
7. تا وقتی این اتصال واقعی در محیط مستقل آزموده نشده، \`trustedReviewerAuthenticationAdapterVerified\` باید false بماند و انتشار/API فعال نشود.

آزمون‌ها فقط کلید RSA، نشست، هویت و گزارش ساختگی را به‌کار می‌برند. این تغییر هیچ مسیر عمومی به \`backend/server.js\` اضافه نمی‌کند و هیچ API یا سرویس بیرونی را فعال نمی‌کند.
