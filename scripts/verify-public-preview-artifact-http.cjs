'use strict';
// Verify the exact built public payload through the canonical local HTTP subpath.
// This binds the smoke test to the packaged bytes; it never contacts or deploys to production.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');

function fail(code) { throw new Error(code); }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function gitBlobSha1(bytes) {
  const hash = crypto.createHash('sha1');
  hash.update('blob ' + bytes.length + String.fromCharCode(0));
  hash.update(bytes);
  return hash.digest('hex');
}
function sameStat(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode &&
    a.nlink === b.nlink && a.size === b.size &&
    a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}
function assertNoSymlinkComponents(target, label) {
  let current = path.resolve(target);
  while (true) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) fail(label + '_path_contains_symlink');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
function canonicalDirectory(target, label) {
  if (typeof target !== 'string' || !path.isAbsolute(target)) fail(label + '_must_be_absolute');
  const absolute = path.resolve(target);
  if (target !== absolute) fail(label + '_must_be_canonical');
  assertNoSymlinkComponents(absolute, label);
  if (fs.realpathSync(absolute) !== absolute || !fs.statSync(absolute).isDirectory()) {
    fail(label + '_must_be_real_directory');
  }
  return absolute;
}
function readStableRegularFile(file, label, maxBytes) {
  assertNoSymlinkComponents(file, label);
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size < 1 || before.size > maxBytes) {
    fail(label + '_must_be_single_link_regular_file_within_size_limit');
  }
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || !sameStat(before, opened)) fail(label + '_changed_before_read');
    const bytes = fs.readFileSync(fd);
    const after = fs.fstatSync(fd);
    const finalPath = fs.lstatSync(file);
    if (!sameStat(opened, after) || !sameStat(after, finalPath) || bytes.length !== after.size) {
      fail(label + '_changed_during_read');
    }
    return bytes;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
function request(address, method, requestPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: address.port,
      method,
      path: requestPath,
      headers: { accept: 'text/html', 'accept-encoding': 'identity' }
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks)
      }));
    });
    req.on('error', reject);
    req.end();
  });
}
async function verifyPublicPreviewArtifactHttp(packageRootArg) {
  if (typeof packageRootArg !== 'string' || !path.isAbsolute(packageRootArg)) {
    fail('package_root_must_be_absolute');
  }
  const packageRoot = canonicalDirectory(packageRootArg, 'package_root');
  const publicDirectory = canonicalDirectory(path.join(packageRoot, 'public'), 'public_directory');
  if (path.dirname(publicDirectory) !== packageRoot) fail('public_directory_layout_invalid');
  const names = fs.readdirSync(publicDirectory).sort();
  if (JSON.stringify(names) !== JSON.stringify(['INTEGRITY.json', 'index.html'])) {
    fail('public_payload_must_contain_exactly_index_and_integrity');
  }

  const htmlBytes = readStableRegularFile(path.join(publicDirectory, 'index.html'), 'preview_html', 512 * 1024);
  const manifestBytes = readStableRegularFile(path.join(publicDirectory, 'INTEGRITY.json'), 'integrity_manifest', 16 * 1024);
  const html = htmlBytes.toString('utf8');
  if (!Buffer.from(html, 'utf8').equals(htmlBytes)) fail('preview_html_must_be_valid_utf8');
  let manifest;
  try { manifest = JSON.parse(manifestBytes.toString('utf8')); }
  catch { fail('integrity_manifest_invalid_json'); }

  const sourceSha256 = sha256(htmlBytes);
  const sourceBlobSha1 = gitBlobSha1(htmlBytes);
  if (!manifest || manifest.schema !== 'dadyar-public-preview-integrity-v1' ||
      !/^[a-f0-9]{40}$/.test(manifest.source_commit || '') ||
      !/^[a-f0-9]{40}$/.test(manifest.workflow_commit || '') ||
      manifest.source_branch !== 'dadyar/ai-chat-private-20261101' ||
      manifest.source_file !== 'public/index.html' ||
      manifest.target_subpath !== '/dadyar-preview/' ||
      manifest.sha256 !== sourceSha256 ||
      manifest.git_blob_sha1 !== sourceBlobSha1 ||
      manifest.topic_hint_count !== 27 ||
      manifest.api_enabled !== false || manifest.public_ai_enabled !== false ||
      manifest.reviewer_authentication !== 'not-configured' ||
      manifest.backup_restore_verified !== false ||
      manifest.destination_verified !== false ||
      manifest.deployment_authorized !== false) {
    fail('integrity_manifest_does_not_match_fail_closed_preview_contract');
  }
  if (!/<html\b[^>]*lang="fa"[^>]*dir="rtl"/i.test(html) ||
      !/name="robots" content="noindex,nofollow,noarchive"/i.test(html) ||
      !/connect-src 'none'/i.test(html) ||
      /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/i.test(html) ||
      /<(?:script|link|iframe|img|audio|video|source|track|object|embed|base)\b[^>]*\b(?:src|href|poster|data|srcset)\s*=/i.test(html)) {
    fail('preview_html_violates_offline_or_indexing_boundary');
  }
  const cspMatch = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/i);
  if (!cspMatch || !/default-src 'none'/.test(cspMatch[1]) ||
      !/connect-src 'none'/.test(cspMatch[1]) || /'unsafe-inline'/i.test(cspMatch[1])) {
    fail('preview_html_csp_missing_or_permissive');
  }
  const responseCsp = cspMatch[1] + "; frame-ancestors 'none'";

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.resume();
      res.writeHead(405, { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    if (req.url !== '/dadyar-preview/' && req.url !== '/dadyar-preview/index.html') {
      res.writeHead(404, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': String(htmlBytes.length),
      'Cache-Control': 'no-store',
      'Strict-Transport-Security': 'max-age=31536000',
      'Content-Security-Policy': responseCsp,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cross-Origin-Resource-Policy': 'same-origin'
    });
    res.end(req.method === 'HEAD' ? undefined : htmlBytes);
  });

  let address;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    address = server.address();
    for (const route of ['/dadyar-preview/', '/dadyar-preview/index.html']) {
      const response = await request(address, 'GET', route);
      if (response.status !== 200 || !response.body.equals(htmlBytes) ||
          sha256(response.body) !== sourceSha256 ||
          response.headers['content-type'] !== 'text/html; charset=utf-8' ||
          response.headers['cache-control'] !== 'no-store' ||
          response.headers['strict-transport-security'] !== 'max-age=31536000' ||
          response.headers['content-security-policy'] !== responseCsp ||
          response.headers['x-content-type-options'] !== 'nosniff' ||
          response.headers['x-frame-options'] !== 'DENY' ||
          response.headers['referrer-policy'] !== 'no-referrer' ||
          response.headers['permissions-policy'] !== 'camera=(), microphone=(), geolocation=()' ||
          response.headers['cross-origin-resource-policy'] !== 'same-origin' ||
          response.headers['set-cookie'] !== undefined || response.headers.location !== undefined) {
        fail('packaged_preview_http_get_verification_failed');
      }
    }
    const head = await request(address, 'HEAD', '/dadyar-preview/');
    if (head.status !== 200 || head.body.length !== 0 ||
        head.headers['content-length'] !== String(htmlBytes.length)) {
      fail('packaged_preview_http_head_verification_failed');
    }
    const root = await request(address, 'GET', '/');
    const traversal = await request(address, 'GET', '/dadyar-preview/../index.html');
    const post = await request(address, 'POST', '/dadyar-preview/');
    if (root.status !== 404 || traversal.status !== 404 || post.status !== 405 ||
        post.headers.allow !== 'GET, HEAD') {
      fail('packaged_preview_http_boundary_verification_failed');
    }
  } finally {
    if (server.listening) await new Promise((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve()));
  }

  return {
    verified: true,
    method: 'loopback-only-http',
    target_subpath: '/dadyar-preview/',
    source_commit: manifest.source_commit,
    workflow_commit: manifest.workflow_commit,
    html_bytes: htmlBytes.length,
    html_sha256: sourceSha256,
    html_git_blob_sha1: sourceBlobSha1,
    manifest_sha256: sha256(manifestBytes),
    exact_public_files: names,
    get_routes_verified: 2,
    head_verified: true,
    root_and_traversal_denied: true,
    post_denied: true,
    security_headers_verified: true,
    api_enabled: false,
    public_ai_enabled: false,
    reviewer_authentication: 'not-configured',
    backup_restore_verified: false,
    destination_verified: false,
    deployment_authorized: false,
    production_host_contacted: false,
    deployment_performed: false
  };
}

if (require.main === module) {
  verifyPublicPreviewArtifactHttp(process.argv[2]).then(result => {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }).catch(error => {
    process.stderr.write('Packaged preview HTTP verification refused: ' + error.message + '\n');
    process.exitCode = 1;
  });
}
module.exports = { verifyPublicPreviewArtifactHttp, sha256, gitBlobSha1 };
