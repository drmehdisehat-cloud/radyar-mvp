'use strict';
// Read-only HTTPS preflight for the isolated Dadyar preview.
// It fetches only /dadyar-preview/ and /dadyar-preview/INTEGRITY.json.
// It never authenticates, deploys, writes, or contacts an API.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const dns = require('node:dns').promises;
const https = require('node:https');
const { Readable } = require('node:stream');

const nonPublicIPv4 = new net.BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
]) nonPublicIPv4.addSubnet(network, prefix, 'ipv4');

const globalIPv6 = new net.BlockList();
globalIPv6.addSubnet('2000::', 3, 'ipv6');
const nonPublicIPv6 = new net.BlockList();
for (const [network, prefix] of [
  ['::', 128], ['::1', 128], ['::ffff:0:0', 96], ['2001::', 23],
  ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20], ['fc00::', 7],
  ['fe80::', 10], ['ff00::', 8]
]) nonPublicIPv6.addSubnet(network, prefix, 'ipv6');

function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return !nonPublicIPv4.check(address, 'ipv4');
  if (family === 6) return globalIPv6.check(address, 'ipv6') && !nonPublicIPv6.check(address, 'ipv6');
  return false;
}

function fail(code) { throw new Error(code); }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

function assertCanonicalPath(value, label, kind) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.resolve(value) !== value) {
    fail(label + '_path_must_be_absolute_canonical');
  }
  const root = path.parse(value).root;
  let current = root;
  const parts = path.relative(root, value).split(path.sep).filter(Boolean);
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) fail(label + '_symlink_forbidden');
    if (index < parts.length - 1 && !stat.isDirectory()) fail(label + '_parent_not_directory');
  }
  if (fs.realpathSync(value) !== value) fail(label + '_path_not_canonical');
  const stat = fs.statSync(value);
  if (kind === 'directory' && !stat.isDirectory()) fail(label + '_not_directory');
  if (kind === 'file' && !stat.isFile()) fail(label + '_not_regular_file');
  return value;
}

function readArtifactFile(directory, name) {
  const filePath = assertCanonicalPath(path.join(directory, name), 'artifact_' + name, 'file');
  const stat = fs.lstatSync(filePath);
  if (stat.nlink !== 1) fail('artifact_hardlink_forbidden:' + name);
  return fs.readFileSync(filePath);
}

function validateLocalArtifact(directoryArg) {
  const directory = assertCanonicalPath(directoryArg, 'artifact_directory', 'directory');
  const names = fs.readdirSync(directory).sort();
  if (JSON.stringify(names) !== JSON.stringify(['INTEGRITY.json', 'index.html'])) {
    fail('artifact_file_set_mismatch');
  }
  const html = readArtifactFile(directory, 'index.html');
  const integrity = readArtifactFile(directory, 'INTEGRITY.json');
  let manifest;
  try { manifest = JSON.parse(integrity.toString('utf8')); }
  catch { fail('artifact_manifest_invalid_json'); }

  const htmlSha256 = sha256(html);
  if (manifest.schemaVersion !== 1 || manifest.artifactType !== 'dadyar-public-preview-review-only') {
    fail('artifact_type_or_schema_mismatch');
  }
  if (!/^[a-f0-9]{40}$/.test(manifest.sourceCommit || '') || manifest.workflowCommit !== manifest.sourceCommit) {
    fail('artifact_source_commit_mismatch');
  }
  if (manifest.sourcePath !== 'dadyar-preview/index.html' ||
      !/^[a-f0-9]{40}$/.test(manifest.sourceGitBlobSha1 || '') ||
      manifest.workflowGitBlobSha1 !== manifest.sourceGitBlobSha1) fail('artifact_git_blob_binding_mismatch');
  if (manifest.route !== '/dadyar-preview/' ||
      JSON.stringify((manifest.files || []).slice().sort()) !== JSON.stringify(['INTEGRITY.json', 'index.html'])) {
    fail('artifact_route_or_file_set_mismatch');
  }
  if (manifest.htmlSha256 !== htmlSha256 || manifest.htmlBytes !== html.length) {
    fail('artifact_html_integrity_mismatch');
  }
  const release = manifest.release || {};
  if (release.status !== 'NOT_READY' || release.apiEnabled !== false || release.publicAiEnabled !== false ||
      release.reviewerAuthentication !== 'not-configured' || release.backupRestoreVerified !== false ||
      release.destinationVerified !== false || release.deploymentAuthorized !== false) {
    fail('artifact_release_boundary_mismatch');
  }
  const htmlText = html.toString('utf8');
  const csp = htmlText.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)?.[1];
  if (!csp) fail('artifact_csp_missing');
  return {
    directory, html, integrity, manifest, csp,
    htmlSha256,
    integritySha256: sha256(integrity)
  };
}

function requireHeaders(response, expected, label) {
  if (response.status !== 200) fail(label + '_http_status_not_200:' + response.status);
  if (response.redirected === true) fail(label + '_redirect_forbidden');
  if (typeof response.url !== 'string' || response.url !== expected.url) fail(label + '_final_url_missing_or_mismatch');
  if (response.headers.get('set-cookie')) fail(label + '_set_cookie_forbidden');

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const mediaType = contentType.split(';', 1)[0].trim();
  if (mediaType !== expected.contentType) fail(label + '_content_type_mismatch');
  const cacheControl = (response.headers.get('cache-control') || '').toLowerCase();
  if (!cacheControl.split(',').map(value => value.trim()).includes('no-store')) fail(label + '_cache_control_no_store_missing');
  if ((response.headers.get('x-content-type-options') || '').toLowerCase() !== 'nosniff') {
    fail(label + '_nosniff_missing');
  }
  if ((response.headers.get('referrer-policy') || '').toLowerCase() !== 'no-referrer') {
    fail(label + '_referrer_policy_missing');
  }
  const robots = (response.headers.get('x-robots-tag') || '').toLowerCase();
  for (const directive of ['noindex', 'nofollow', 'noarchive']) {
    if (!robots.split(',').map(value => value.trim()).includes(directive)) fail(label + '_robots_directive_missing:' + directive);
  }
  if (expected.csp && response.headers.get('content-security-policy') !== expected.csp) {
    fail(label + '_content_security_policy_mismatch');
  }
}

async function readBodyBounded(response, maxBytes, label) {
  if (!response.body || typeof response.body.getReader !== 'function') fail(label + '_body_stream_unavailable');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch {}
        fail(label + '_body_too_large');
      }
      chunks.push(chunk);
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  return Buffer.concat(chunks, total);
}

async function fetchExact(fetchImpl, url, expected, label) {
  const response = await fetchImpl(url, {
    method: 'GET',
    redirect: 'manual',
    credentials: 'omit',
    cache: 'no-store',
    headers: { Accept: expected.accept }
  });
  requireHeaders(response, { ...expected, url }, label);
  const bytes = await readBodyBounded(response, expected.bytes.length, label);
  if (!bytes.equals(expected.bytes)) fail(label + '_body_bytes_mismatch');
  return { bytes, sha256: sha256(bytes), contentType: response.headers.get('content-type') };
}


function assertSafeStagingHostname(hostname, label) {
  const lowered = hostname.toLowerCase();
  const normalized = lowered.endsWith('.') ? lowered.slice(0, -1) : lowered;
  const ipCandidate = normalized.startsWith('[') && normalized.endsWith(']')
    ? normalized.slice(1, -1)
    : normalized;
  if (net.isIP(ipCandidate)) fail(label + '_ip_literal_forbidden');
  const localSuffixes = [
    '.localhost', '.local', '.internal', '.localdomain',
    '.home.arpa', '.lan', '.home', '.corp', '.intranet'
  ];
  if (normalized === 'localhost' || localSuffixes.some(suffix => normalized.endsWith(suffix))) {
    fail(label + '_local_hostname_forbidden');
  }
  if (lowered.endsWith('.')) fail(label + '_trailing_dot_hostname_forbidden');
  if (!normalized.includes('.')) fail(label + '_fully_qualified_hostname_required');
}

async function resolvePublicStagingAddresses(hostname, lookup = dns.lookup) {
  let records;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    fail('staging_dns_lookup_failed');
  }
  if (!Array.isArray(records) || records.length === 0) fail('staging_dns_no_addresses');
  const unique = new Map();
  for (const record of records) {
    if (!record || typeof record.address !== 'string') fail('staging_dns_record_invalid');
    const family = net.isIP(record.address);
    if (!family || !isPublicAddress(record.address)) fail('staging_dns_non_public_address');
    if (record.family !== undefined && record.family !== family) fail('staging_dns_family_mismatch');
    unique.set(record.address, { address: record.address, family });
  }
  return Array.from(unique.values());
}

function createPinnedLookup(hostname, address) {
  const expectedHostname = hostname.toLowerCase();
  const family = net.isIP(address);
  if (!family || !isPublicAddress(address)) fail('staging_pinned_address_not_public');
  return (requestedHostname, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (typeof callback !== 'function') throw new TypeError('staging_dns_callback_required');
    const requested = String(requestedHostname).toLowerCase();
    if (requested !== expectedHostname) return callback(new Error('staging_dns_host_mismatch'));
    if (options && typeof options === 'object' && options.family && options.family !== family) {
      const error = new Error('staging_dns_family_mismatch');
      error.code = 'EAI_ADDRFAMILY';
      return callback(error);
    }
    const entry = { address, family };
    if (options && typeof options === 'object' && options.all) return callback(null, [entry]);
    return callback(null, address, family);
  };
}

function createPinnedHttpsFetch(hostname, address, requestImpl = https.request) {
  const normalizedHost = hostname.toLowerCase();
  const lookup = createPinnedLookup(normalizedHost, address);
  return async (urlValue, options = {}) => {
    const url = new URL(urlValue);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== normalizedHost) {
      fail('staging_pinned_fetch_origin_mismatch');
    }
    if (options.method && options.method !== 'GET') fail('staging_pinned_fetch_method_forbidden');
    return new Promise((resolve, reject) => {
      const request = requestImpl(url, {
        method: 'GET',
        headers: options.headers || {},
        agent: false,
        servername: normalizedHost,
        rejectUnauthorized: true,
        lookup
      });
      request.once('response', incoming => {
        try {
          const headers = new Headers();
          for (const [name, value] of Object.entries(incoming.headers || {})) {
            if (value === undefined) continue;
            if (Array.isArray(value)) {
              for (const item of value) headers.append(name, String(item));
            } else {
              headers.set(name, String(value));
            }
          }
          const response = new Response(Readable.toWeb(incoming), {
            status: Number(incoming.statusCode || 0),
            headers
          });
          Object.defineProperty(response, 'url', { value: url.href });
          resolve(response);
        } catch (error) {
          if (typeof incoming.destroy === 'function') incoming.destroy();
          reject(error);
        }
      });
      request.once('error', reject);
      if (typeof request.setTimeout === 'function') {
        request.setTimeout(15000, () => request.destroy(new Error('staging_request_timeout')));
      }
      request.end();
    });
  };
}

async function probeStaging(urlValue, artifactDirectory, fetchImpl, allowedOriginValue = process.env.DADYAR_PREVIEW_STAGING_ORIGIN, lookupImpl = dns.lookup, requestImpl = https.request) {
  let url;
  try { url = new URL(urlValue); }
  catch { fail('staging_url_invalid'); }
  if (url.protocol !== 'https:') fail('staging_url_must_use_https');
  if (url.username || url.password || url.search || url.hash) fail('staging_url_credentials_query_or_fragment_forbidden');
  if (url.pathname !== '/dadyar-preview/') fail('staging_route_must_be_exact_dadyar_preview_path');
  if (typeof allowedOriginValue !== 'string' || !allowedOriginValue) fail('staging_origin_allowlist_required');
  let allowedOrigin;
  try { allowedOrigin = new URL(allowedOriginValue); }
  catch { fail('staging_origin_allowlist_invalid'); }
  if (allowedOrigin.protocol !== 'https:' || allowedOrigin.username || allowedOrigin.password ||
      allowedOrigin.pathname !== '/' || allowedOrigin.search || allowedOrigin.hash ||
      allowedOrigin.origin !== allowedOriginValue) fail('staging_origin_allowlist_must_be_canonical_https_origin');
  if (url.origin !== allowedOrigin.origin) fail('staging_origin_not_allowlisted');
  // Never let a staging probe accidentally target the live production host, including its DNS trailing-dot form.
  const normalizedHost = url.hostname.toLowerCase().replace(/\.$/, '');
  if (normalizedHost === 'mehdisehat.ir' || normalizedHost === 'www.mehdisehat.ir') {
    fail('staging_production_origin_forbidden');
  }
  // The probe must target a named, externally managed staging host, never a local service or IP literal.
  assertSafeStagingHostname(url.hostname, 'staging');

  const artifact = validateLocalArtifact(artifactDirectory);
  let pinnedAddress = null;
  let dnsAddressCount = 0;
  if (fetchImpl === undefined || fetchImpl === null) {
    const addresses = await resolvePublicStagingAddresses(url.hostname, lookupImpl);
    pinnedAddress = addresses[0];
    dnsAddressCount = addresses.length;
    fetchImpl = createPinnedHttpsFetch(url.hostname, pinnedAddress.address, requestImpl);
  }
  if (typeof fetchImpl !== 'function') fail('fetch_unavailable');

  const htmlResult = await fetchExact(fetchImpl, url.toString(), {
    bytes: artifact.html,
    contentType: 'text/html',
    accept: 'text/html',
    csp: artifact.csp
  }, 'preview_html');
  const integrityUrl = new URL('INTEGRITY.json', url).toString();
  const integrityResult = await fetchExact(fetchImpl, integrityUrl, {
    bytes: artifact.integrity,
    contentType: 'application/json',
    accept: 'application/json'
  }, 'preview_integrity');

  return {
    status: 'STAGING_HTTPS_PROBE_VERIFIED_NOT_RELEASE_AUTHORIZED',
    origin: url.origin,
    route: url.pathname,
    networkTargetPinned: Boolean(pinnedAddress),
    pinnedAddressFamily: pinnedAddress ? pinnedAddress.family : null,
    dnsAddressCount,
    sourceCommit: artifact.manifest.sourceCommit,
    htmlSha256: htmlResult.sha256,
    integritySha256: integrityResult.sha256,
    htmlBytes: htmlResult.bytes.length,
    integrityBytes: integrityResult.bytes.length,
    requests: [
      { method: 'GET', path: '/dadyar-preview/' },
      { method: 'GET', path: '/dadyar-preview/INTEGRITY.json' }
    ],
    headersVerified: {
      exactContentSecurityPolicy: true,
      cacheControlNoStore: true,
      xContentTypeOptionsNosniff: true,
      referrerPolicyNoReferrer: true,
      xRobotsTagNoIndexNoFollowNoArchive: true,
      noSetCookie: true
    },
    releaseStatus: artifact.manifest.release.status,
    apiEnabled: artifact.manifest.release.apiEnabled,
    publicAiEnabled: artifact.manifest.release.publicAiEnabled,
    deploymentAuthorized: false
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2) fail('usage: DADYAR_PREVIEW_STAGING_ORIGIN=https://staging.example node scripts/probe-preview-staging-http.cjs https://staging.example/dadyar-preview/ /absolute/path/to/artifact');
  const result = await probeStaging(args[0], args[1]);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(JSON.stringify({ status: 'NOT_VERIFIED', reason: error.message }) + '\n');
    process.exitCode = 2;
  });
}

module.exports = { probeStaging, validateLocalArtifact, resolvePublicStagingAddresses, createPinnedLookup, createPinnedHttpsFetch };
