'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function fail(message) { throw new Error(message); }
function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (relative !== '..' &&
    !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}
function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
function writeExclusive(filePath, content) {
  const fd = fs.openSync(filePath, 'wx', 0o600);
  try { fs.writeFileSync(fd, content); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}

function buildOfflinePreviewPackage(destinationArg, options = {}) {
  if (typeof destinationArg !== 'string' || !destinationArg.trim()) {
    fail('A dedicated destination directory is required.');
  }
  const repoRoot = path.resolve(options.repoRoot || path.resolve(__dirname, '..'));
  const sourcePath = path.resolve(options.sourcePath || path.join(repoRoot, 'dadyar-preview', 'index.html'));
  const destination = path.resolve(destinationArg);
  const commit = options.commit || process.env.GITHUB_SHA;
  const branch = options.branch || process.env.GITHUB_REF_NAME;

  if (!/^[a-f0-9]{40}$/.test(String(commit || ''))) {
    fail('A full 40-character source commit SHA is required.');
  }
  if (branch !== 'dadyar/ai-chat-private-20261101') {
    fail('The handoff package is restricted to the approved experimental branch.');
  }
  if (inside(repoRoot, destination)) {
    fail('The package destination must be outside the repository.');
  }

  const sourceStat = fs.lstatSync(sourcePath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || sourceStat.nlink !== 1) {
    fail('Preview source must be a regular, non-symlink file with one link.');
  }
  const realRoot = fs.realpathSync(repoRoot);
  const realSource = fs.realpathSync(sourcePath);
  if (!inside(realRoot, realSource)) {
    fail('Preview source resolves outside the repository.');
  }

  const sourceBytes = fs.readFileSync(sourcePath);
  const html = sourceBytes.toString('utf8');
  if (!Buffer.from(html, 'utf8').equals(sourceBytes)) fail('Preview source is not valid UTF-8.');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  const topicHints = script.match(/const topicHints = \[([\s\S]*?)\n\];/)?.[1] || '';
  const topicCount = (topicHints.match(/"id"\s*:/g) || []).length;

  const required = [
    [/default-src 'none'/, 'default-src none CSP'],
    [/connect-src 'none'/, 'connect-src none CSP'],
    [/<meta name="robots" content="noindex,nofollow,noarchive">/, 'no-index metadata'],
    [/id="free-question"/, 'free-question intake'],
    [/id="human-review"/, 'human-review section'],
    [/id="record-review"/, 'review recording control'],
    [/id="export-ack"/, 'explicit local review acknowledgement'],
    [/id="download" disabled/, 'disabled-by-default report export'],
    [/هویت احراز نشده/, 'unverified reviewer disclosure']
  ];
  for (const [pattern, label] of required) {
    if (!pattern.test(html)) fail('Preview package missing required control: ' + label);
  }
  if (topicCount !== 27) fail('Expected exactly 27 internal topic hints.');
  if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/i.test(html)) {
    fail('Preview must not contain network-capable browser APIs.');
  }
  if (/<form\b/i.test(html) ||
      /<(?:script|link|iframe|img|audio|video|source)\b[^>]*\b(?:src|href)\s*=\s*['"]?\s*(?:https?:|\/\/)/i.test(html)) {
    fail('Preview must remain self-contained and must not load remote resources.');
  }

  const parentDirectory = path.dirname(destination);
  const parentStat = fs.lstatSync(parentDirectory);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    fail('Package parent must be an existing, non-symlink directory.');
  }
  const realParent = fs.realpathSync(parentDirectory);
  if (realParent !== parentDirectory) fail('Package parent must resolve without symlink aliases.');
  if (fs.existsSync(destination)) fail('Package destination already exists; refusing overwrite.');

  fs.mkdirSync(destination, { mode: 0o700 });
  const metadata = {
    package: 'dadyar-offline-preview-handoff',
    source_commit: commit,
    source_branch: branch,
    target_subpath: '/dadyar-preview/',
    source_file: 'dadyar-preview/index.html',
    source_file_sha256: sha256(sourceBytes),
    topic_hint_count: topicCount,
    api_enabled: false,
    public_ai_enabled: false,
    reviewer_authentication: 'not-implemented',
    reviewer_record_type: 'local-self-attestation-only',
    backup_restore_verified: false,
    destination_verified: false,
    deployment_authorized: false
  };
  const readme = [
    'دادیار | بسته تحویل پیش‌نمایش آفلاین',
    '',
    'محتوای این بسته فقط یک پیش‌نمایش ایستا و خودبسنده از سناریوی چک کاملاً ساختگی است.',
    'مسیر مقصد مورد انتظار پس از اخذ مجوزهای لازم: /dadyar-preview/',
    '',
    'این بسته مجوز استقرار نیست. تا زمان اثبات بازیابی بکاپ در محیط مستقل، اعتبارسنجی مسیر مقصد، آزمون HTTPS زنده، بررسی امنیت و تأیید صریح مالک، آن را روی هاست بارگذاری نکنید.',
    'هیچ API یا گفت‌وگوی هوشمند عمومی در این بسته فعال نیست.',
    'بازبینی داخل پیش‌نمایش فقط اظهار محلی است؛ هویت بازبین احراز نمی‌شود و ساعت دستگاه مهر زمانی معتبر نیست.',
    'منابع حقوقی این سناریو تأیید نشده‌اند و خروجی، مشاوره یا سند رسمی نیست.',
    'فقط از داده ساختگی استفاده کنید؛ اطلاعات موکل یا اسرار واقعی وارد نکنید.',
    '',
    'ابتدا SHA256SUMS را با sha256sum -c SHA256SUMS اعتبارسنجی کنید.',
    'شناسه commit مبدأ در PREVIEW-METADATA.json ثبت شده است.'
  ].join('\n') + '\n';

  writeExclusive(path.join(destination, 'index.html'), sourceBytes);
  writeExclusive(path.join(destination, 'README-fa.txt'), Buffer.from(readme, 'utf8'));
  writeExclusive(path.join(destination, 'PREVIEW-METADATA.json'),
    Buffer.from(JSON.stringify(metadata, null, 2) + '\n', 'utf8'));

  const names = ['PREVIEW-METADATA.json', 'README-fa.txt', 'index.html'];
  const manifest = names.map(name => {
    const bytes = fs.readFileSync(path.join(destination, name));
    return sha256(bytes) + '  ' + name;
  }).join('\n') + '\n';
  writeExclusive(path.join(destination, 'SHA256SUMS'), Buffer.from(manifest, 'utf8'));

  const actualNames = fs.readdirSync(destination).sort();
  const expectedNames = [...names, 'SHA256SUMS'].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    fail('Unexpected file set in preview package.');
  }
  for (const line of manifest.trimEnd().split('\n')) {
    const [expectedHash, name] = line.split(/\s{2}/);
    if (sha256(fs.readFileSync(path.join(destination, name))) !== expectedHash) {
      fail('Package readback hash mismatch: ' + name);
    }
  }
  if (!fs.readFileSync(path.join(destination, 'index.html')).equals(sourceBytes)) {
    fail('Packaged preview differs from the checked source.');
  }
  return {
    destination, files: actualNames, source_commit: commit,
    source_sha256: metadata.source_file_sha256,
    release_authorized: false, api_enabled: false, checksums_verified: true
  };
}

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(buildOfflinePreviewPackage(process.argv[2]), null, 2) + '\n');
  } catch (error) {
    process.stderr.write('Preview package refused: ' + error.message + '\n');
    process.exitCode = 1;
  }
}
module.exports = { buildOfflinePreviewPackage };
