'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { readStableRegularFile } = require('./stable-file-integrity.cjs');

const MAX_PREVIEW_BYTES = 1024 * 1024;

function fail(message) { throw new Error(message); }
function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (relative !== '..' &&
    !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}
function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
function gitBlobSha1(bytes) {
  const hash = crypto.createHash('sha1');
  hash.update('blob ' + bytes.length + String.fromCharCode(0));
  hash.update(bytes);
  return hash.digest('hex');
}
function writeExclusive(filePath, content, mode = 0o600) {
  const fd = fs.openSync(filePath, 'wx', mode);
  try { fs.writeFileSync(fd, content); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}

function parseOpeningTagAttributes(tagText, tagName) {
  let index = 1 + tagName.length;
  const attributes = [];
  while (index < tagText.length - 1) {
    while (index < tagText.length - 1 && (/\s/.test(tagText[index]) || tagText[index] === '/')) index++;
    if (tagText[index] === '>') break;
    const nameStart = index;
    while (index < tagText.length - 1 && !/[\s=/>]/.test(tagText[index])) index++;
    if (index === nameStart) fail('Preview contains a malformed resource tag.');
    const name = tagText.slice(nameStart, index).toLowerCase();
    while (index < tagText.length - 1 && /\s/.test(tagText[index])) index++;
    let value = null;
    if (tagText[index] === '=') {
      index++;
      while (index < tagText.length - 1 && /\s/.test(tagText[index])) index++;
      const quote = tagText[index] === '"' || tagText[index] === "'" ? tagText[index] : null;
      if (quote) {
        index++;
        const valueStart = index;
        while (index < tagText.length - 1 && tagText[index] !== quote) index++;
        if (index >= tagText.length - 1) fail('Preview contains a malformed resource tag.');
        value = tagText.slice(valueStart, index);
        index++;
      } else {
        const valueStart = index;
        while (index < tagText.length - 1 && !/[\s>]/.test(tagText[index])) index++;
        value = tagText.slice(valueStart, index);
      }
    }
    attributes.push({ name, value });
  }
  return attributes;
}

function findOpeningTags(html, names) {
  const pattern = new RegExp('<(' + names.join('|') + ')\\b', 'gi');
  const tags = [];
  let match;
  while ((match = pattern.exec(html)) !== null) {
    let quote = null;
    let end = -1;
    for (let index = pattern.lastIndex; index < html.length; index++) {
      const character = html[index];
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        end = index;
        break;
      }
    }
    if (end < 0 || quote !== null) fail('Preview contains a malformed resource tag.');
    const name = match[1].toLowerCase();
    const raw = html.slice(match.index, end + 1);
    tags.push({ name, raw, attributes: parseOpeningTagAttributes(raw, name) });
    pattern.lastIndex = end + 1;
  }
  return tags;
}

function assertSelfContainedHtml(html) {
  const resourceNames = ['script', 'link', 'iframe', 'img', 'audio', 'video', 'source', 'track', 'object', 'embed', 'base'];
  const svgNames = ['image', 'feImage', 'use'];
  const tags = findOpeningTags(html, [...resourceNames, ...svgNames, 'meta']);
  const forbiddenResourceAttributes = new Set(['src', 'href', 'poster', 'data', 'srcset']);
  for (const tag of tags) {
    if (resourceNames.includes(tag.name) &&
        tag.attributes.some(attribute => forbiddenResourceAttributes.has(attribute.name))) {
      fail('Preview must be fully self-contained; resource references are not allowed.');
    }
    if (svgNames.some(name => name.toLowerCase() === tag.name)) {
      for (const attribute of tag.attributes) {
        if (attribute.name === 'href' || attribute.name === 'xlink:href') {
          const value = attribute.value ?? '';
          if (!value.startsWith('#') || value.length < 2) {
            fail('Preview must be fully self-contained; external SVG references are not allowed.');
          }
        }
      }
    }
    if (tag.name === 'meta' && tag.attributes.some(attribute =>
      attribute.name === 'http-equiv' && String(attribute.value ?? '').trim().toLowerCase() === 'refresh')) {
      fail('Preview must not use meta refresh navigation.');
    }
  }
  if (/<(?:iframe|audio|video|source|track|object|embed|base)\b/i.test(html) ||
      /<style\b[^>]*>[\s\S]*?(?:\burl\s*\(|@import\b)/i.test(html) ||
      /\bstyle\s*=\s*(?:"[^"]*(?:\burl\s*\(|@import\b)[^"]*"|'[^']*(?:\burl\s*\(|@import\b)[^']*')/i.test(html)) {
    fail('Preview must be fully self-contained; resource references are not allowed.');
  }
}
function buildOfflinePreviewPackage(destinationArg, options = {}) {
  if (typeof destinationArg !== 'string' || !destinationArg.trim()) {
    fail('A dedicated destination directory is required.');
  }
  const repoRoot = path.resolve(options.repoRoot || path.resolve(__dirname, '..'));
  const sourcePath = path.resolve(options.sourcePath || path.join(repoRoot, 'dadyar-preview', 'index.html'));
  const destination = path.resolve(destinationArg);
  // On pull_request events, GITHUB_SHA is the synthetic merge commit.
  // Bind the package to the actual branch head, while recording the workflow SHA separately.
  const commit = options.commit || process.env.DADYAR_PREVIEW_SOURCE_SHA || process.env.GITHUB_SHA;
  const workflowCommit = options.workflowCommit || process.env.DADYAR_PREVIEW_WORKFLOW_SHA || process.env.GITHUB_SHA || commit;
  const workflowEvent = options.workflowEvent || process.env.DADYAR_PREVIEW_EVENT || process.env.GITHUB_EVENT_NAME || 'local-test';
  // GITHUB_REF_NAME is a reserved Actions variable and remains <number>/merge on PR runs.
  // Use a dedicated, explicitly supplied branch identity for non-deploying PR artifacts.
  const branch = options.branch || process.env.DADYAR_PREVIEW_BRANCH || process.env.GITHUB_REF_NAME;

  if (!/^[a-f0-9]{40}$/.test(String(commit || ''))) {
    fail('A full 40-character source commit SHA is required.');
  }
  if (!/^[a-f0-9]{40}$/.test(String(workflowCommit || ''))) {
    fail('A full 40-character workflow commit SHA is required.');
  }
  if (typeof workflowEvent !== 'string' || !/^(push|pull_request|local-test)$/.test(workflowEvent)) {
    fail('A supported workflow event identity is required.');
  }
  if (branch !== 'dadyar/ai-chat-private-20261101') {
    fail('The handoff package is restricted to the approved experimental branch.');
  }
  if (inside(repoRoot, destination)) {
    fail('The package destination must be outside the repository.');
  }

  const realRoot = fs.realpathSync(repoRoot);
  // Read the pinned source through a no-follow descriptor. This rejects symlinked
  // ancestors, hard-link aliases, non-regular files, oversized inputs and files
  // whose inode/size/timestamps change while the bytes are being hashed.
  let sourceRead;
  try {
    sourceRead = readStableRegularFile(sourcePath, 'preview source', {
      includeBytes: true,
      maxBytes: MAX_PREVIEW_BYTES
    });
  } catch (error) {
    // O_NOFOLLOW reports a final-component symlink as ELOOP on supported POSIX
    // systems. Keep the package builder's refusal message stable and path-free.
    if (error && error.code === 'ELOOP') {
      fail('Preview source must be a regular, non-symlink file with one link.');
    }
    throw error;
  }
  const realSource = fs.realpathSync(sourcePath);
  if (!inside(realRoot, realSource)) {
    fail('Preview source resolves outside the repository.');
  }

  const sourceBytes = sourceRead.bytes;
  const html = sourceBytes.toString('utf8');
  if (!Buffer.from(html, 'utf8').equals(sourceBytes)) fail('Preview source is not valid UTF-8.');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  const topicHints = script.match(/const topicHints = \[([\s\S]*?)\n\];/)?.[1] || '';
  const topicCount = (topicHints.match(/"id"\s*:/g) || []).length;
  const calculatorTag = html.match(/<section\b[^>]*id="delay-damages-calculator"[^>]*>/)?.[0] || '';
  const delayIndexesRaw = calculatorTag.match(/\bdata-indexes='([^']+)'/)?.[1];
  let delayIndexes;
  try { delayIndexes = JSON.parse(delayIndexesRaw || ''); }
  catch { fail('Delay-damages calculator index data is missing or invalid.'); }
  const delayBaseYear = Number(calculatorTag.match(/\bdata-base-year="(\d+)"/)?.[1]);
  const delayBaseYearStatus = calculatorTag.match(/\bdata-base-year-status="([^"]+)"/)?.[1] || '';
  const delaySourceStatus = calculatorTag.match(/\bdata-source-status="([^"]+)"/)?.[1] || '';
  if (JSON.stringify(Object.keys(delayIndexes).sort()) !== JSON.stringify(['1','2','3','4','5','6','7']) ||
      delayIndexes['5'] !== 3333.9 || delayBaseYear !== 1395 ||
      !delayBaseYearStatus.startsWith('inferred-from-1395-average-100') ||
      delaySourceStatus !== 'transcribed-not-independently-authenticated') {
    fail('Delay-damages calculator data does not match the seven guarded 1405 source values.');
  }


  const required = [
    [/default-src 'none'/, 'default-src none CSP'],
    [/connect-src 'none'/, 'connect-src none CSP'],
    [/<meta name="robots" content="noindex,nofollow,noarchive">/, 'no-index metadata'],
    [/id="free-question"/, 'free-question intake'],
    [/id="human-review"/, 'human-review section'],
    [/id="record-review"/, 'review recording control'],
    [/id="export-ack"/, 'explicit local review acknowledgement'],
    [/id="download" disabled/, 'disabled-by-default report export'],
    [/هویت احراز نشده/, 'unverified reviewer disclosure'],
    [/id="delay-damages-calculator"/, 'offline delay-damages calculator'],
    [/id="delay-principal"/, 'delay-damages principal input'],
    [/id="delay-due-month"/, 'delay-damages origin month'],
    [/id="delay-payment-month"/, 'delay-damages payment month'],
    [/id="delay-calculate"/, 'delay-damages calculation control'],
    [/id="delay-index-list"/, 'visible 1405 index list'],
    [/هنوز با جدول رسمی بانک مرکزی تطبیق مستقل نشده‌اند/, 'visible unverified 1405 index-source disclosure'],
    [/منبع داده: تصویر مالک؛ تأیید رسمی و حقوقی نشده است/, 'calculator-result source disclosure'],
    [/مبدأ قانونی ماده ۵۲۲ یا شرایط مطالبه را تعیین نمی‌کند/, 'legal applicability disclaimer']
  ];
  for (const [pattern, label] of required) {
    if (!pattern.test(html)) fail('Preview package missing required control: ' + label);
  }
  if (topicCount !== 27) fail('Expected exactly 27 internal topic hints.');
  if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/i.test(html)) {
    fail('Preview must not contain network-capable browser APIs.');
  }
  if (/<form\b/i.test(html)) {
    fail('Preview must remain self-contained and must not contain forms.');
  }
  assertSelfContainedHtml(html);

  const parentDirectory = path.dirname(destination);
  const parentStat = fs.lstatSync(parentDirectory);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    fail('Package parent must be an existing, non-symlink directory.');
  }
  const realParent = fs.realpathSync(parentDirectory);
  if (realParent !== parentDirectory) fail('Package parent must resolve without symlink aliases.');
  if (fs.existsSync(destination)) fail('Package destination already exists; refusing overwrite.');

  fs.mkdirSync(destination, { mode: 0o700 });
  const destinationStat = fs.lstatSync(destination);
  if (!destinationStat.isDirectory() || destinationStat.isSymbolicLink() ||
      fs.realpathSync(destination) !== destination) {
    fail('Package destination must be a canonical, non-symlink directory.');
  }
  const metadata = {
    package: 'dadyar-offline-preview-handoff',
    source_commit: commit,
    workflow_commit: workflowCommit,
    workflow_event: workflowEvent,
    source_branch: branch,
    target_subpath: '/dadyar-preview/',
    public_payload_path: 'public/index.html',
    operator_handoff_path: 'handoff/',
    source_file: 'dadyar-preview/index.html',
    source_file_sha256: sha256(sourceBytes),
    source_file_git_blob_sha1: gitBlobSha1(sourceBytes),
    topic_hint_count: topicCount,
    api_enabled: false,
    public_ai_enabled: false,
    delay_damages_calculator: 'offline-only',
    delay_index_series: 'annual-index-published-monthly',
    delay_index_base_year: delayBaseYear,
    delay_index_base_year_status: delayBaseYearStatus,
    delay_index_months_available: Object.keys(delayIndexes).length,
    delay_index_source_status: delaySourceStatus,
    reviewer_authentication: 'not-configured',
    reviewer_record_type: 'local-self-attestation-only',
    backup_restore_verified: false,
    destination_verified: false,
    deployment_authorized: false
  };
  const readme = [
    'دادیار | بسته تحویل پیش‌نمایش آفلاین',
    '',
    'محتوای این بسته فقط یک پیش‌نمایش ایستا و خودبسنده از سناریوی چک کاملاً ساختگی است.',
    'ساختار بسته: پوشه public فقط public/index.html را برای بارگذاری دارد؛ پوشه handoff/ صرفاً اسناد اپراتور است و نباید وارد Document Root شود.',
    'مسیر مقصد مورد انتظار پس از اخذ مجوزهای لازم: /dadyar-preview/',
    'محاسبه‌گر خسارت تأخیر تأدیه آفلاین نیز در همین فایل تعبیه شده است؛ فقط هفت مقدار فروردین تا مهر ۱۴۰۵ از تصویر مالک رونویسی شده‌اند.',
    'سال پایه ۱۳۹۵=۱۰۰ از ردیف ۱۳۹۵ تصویر استنباط شده و هنوز با جدول رسمی بانک مرکزی تطبیق مستقل نشده است؛ سال‌ها و ماه‌های فاقد داده عمداً محاسبه نمی‌شوند.',
    '',
    'این بسته مجوز استقرار نیست. تا زمان اثبات بازیابی بکاپ در محیط مستقل، اعتبارسنجی مسیر مقصد، آزمون HTTPS زنده، بررسی امنیت و تأیید صریح مالک، آن را روی هاست بارگذاری نکنید.',
    'هیچ API یا گفت‌وگوی هوشمند عمومی در این بسته فعال نیست.',
    'بازبینی داخل پیش‌نمایش فقط اظهار محلی است؛ هویت بازبین احراز نمی‌شود و ساعت دستگاه مهر زمانی معتبر نیست.',
    'منابع حقوقی این سناریو تأیید نشده‌اند و خروجی، مشاوره یا سند رسمی نیست.',
    'فقط از داده ساختگی استفاده کنید؛ اطلاعات موکل یا اسرار واقعی وارد نکنید.',
    'پس از عبور همه دروازه‌ها فقط public/index.html را به /dadyar-preview/index.html منتقل کنید؛ ریشه بسته و handoff/ را بارگذاری نکنید.',
    'به پوشه عمومی .htaccess، redirect، symlink یا فایل دیگری اضافه نکنید؛ سرآیندهای HTTP باید در سطح vhost/میزبان تنظیم شوند.',
    '',
    'از ریشه بسته، فایل‌های تحویل را با sha256sum -c handoff/SHA256SUMS اعتبارسنجی کنید.',
    'شناسه commit مبدأ، SHA-256 و Git blob SHA-1 فایل در handoff/PREVIEW-METADATA.json ثبت شده‌اند.'
  ].join('\n') + '\n';

  const publicDirectory = path.join(destination, 'public');
  const handoffDirectory = path.join(destination, 'handoff');
  fs.mkdirSync(publicDirectory, { mode: 0o755 });
  fs.chmodSync(publicDirectory, 0o755);
  fs.mkdirSync(handoffDirectory, { mode: 0o700 });
  fs.chmodSync(handoffDirectory, 0o700);
  writeExclusive(path.join(publicDirectory, 'index.html'), sourceBytes, 0o644);
  writeExclusive(path.join(handoffDirectory, 'README-fa.txt'), Buffer.from(readme, 'utf8'));
  writeExclusive(path.join(handoffDirectory, 'PREVIEW-METADATA.json'),
    Buffer.from(JSON.stringify(metadata, null, 2) + '\n', 'utf8'));

  function readPackageFile(name) {
    return readStableRegularFile(path.join(destination, name), 'package file ' + name, {
      includeBytes: true,
      maxBytes: MAX_PREVIEW_BYTES
    }).bytes;
  }
  const names = ['handoff/PREVIEW-METADATA.json', 'handoff/README-fa.txt', 'public/index.html'];
  const manifest = names.map(name => {
    const bytes = readPackageFile(name);
    return sha256(bytes) + '  ' + name;
  }).join('\n') + '\n';
  writeExclusive(path.join(handoffDirectory, 'SHA256SUMS'), Buffer.from(manifest, 'utf8'));

  const actualNames = fs.readdirSync(destination).sort();
  const expectedNames = ['handoff', 'public'];
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    fail('Unexpected top-level entry set in preview package.');
  }
  const publicNames = fs.readdirSync(publicDirectory).sort();
  if (JSON.stringify(publicNames) !== JSON.stringify(['index.html'])) {
    fail('Public payload must contain only index.html.');
  }
  const handoffNames = fs.readdirSync(handoffDirectory).sort();
  if (JSON.stringify(handoffNames) !== JSON.stringify(['PREVIEW-METADATA.json', 'README-fa.txt', 'SHA256SUMS'])) {
    fail('Unexpected operator handoff file set.');
  }
  if ((fs.statSync(publicDirectory).mode & 0o777) !== 0o755 ||
      (fs.statSync(path.join(publicDirectory, 'index.html')).mode & 0o777) !== 0o644 ||
      (fs.statSync(handoffDirectory).mode & 0o777) !== 0o700) {
    fail('Preview package permissions do not match the public/private layout.');
  }
  const manifestReadback = readPackageFile('handoff/SHA256SUMS');
  if (!manifestReadback.equals(Buffer.from(manifest, 'utf8'))) {
    fail('Package manifest readback mismatch.');
  }
  for (const line of manifest.trimEnd().split('\n')) {
    const [expectedHash, name] = line.split(/\s{2}/);
    if (sha256(readPackageFile(name)) !== expectedHash) {
      fail('Package readback hash mismatch: ' + name);
    }
  }
  if (!readPackageFile('public/index.html').equals(sourceBytes)) {
    fail('Packaged preview differs from the checked source.');
  }
  return {
    destination, files: [...names, 'handoff/SHA256SUMS'], public_files: publicNames,
    handoff_files: handoffNames, source_commit: commit,
    workflow_commit: workflowCommit,
    source_sha256: metadata.source_file_sha256,
    source_blob_sha1: metadata.source_file_git_blob_sha1,
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
module.exports = { buildOfflinePreviewPackage, assertSelfContainedHtml };
