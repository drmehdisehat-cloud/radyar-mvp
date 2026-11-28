'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const { probeStaging, resolvePublicStagingAddresses, createPinnedLookup } = require('../scripts/probe-preview-staging-http.cjs');

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const csp = "default-src 'none'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; media-src 'none'; manifest-src 'none'; worker-src 'none'; child-src 'none'; script-src 'sha256-example'; style-src 'sha256-example'; form-action 'none'; base-uri 'none'";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dadyar-staging-http-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const html = Buffer.from('<!doctype html><html lang="fa"><head><meta http-equiv="Content-Security-Policy" content="' + csp + '"></head><body>synthetic preview</body></html>\n');
  const integrity = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    artifactType: 'dadyar-public-preview-review-only',
    sourceCommit: 'a'.repeat(40),
    workflowCommit: 'a'.repeat(40),
    sourcePath: 'dadyar-preview/index.html',
    sourceGitBlobSha1: 'b'.repeat(40),
    workflowGitBlobSha1: 'b'.repeat(40),
    htmlSha256: sha256(html),
    htmlBytes: html.length,
    route: '/dadyar-preview/',
    files: ['index.html', 'INTEGRITY.json'],
    release: {
      status: 'NOT_READY',
      apiEnabled: false,
      publicAiEnabled: false,
      reviewerAuthentication: 'not-configured',
      backupRestoreVerified: false,
      destinationVerified: false,
      deploymentAuthorized: false
    }
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'index.html'), html);
  fs.writeFileSync(path.join(root, 'INTEGRITY.json'), integrity);
  return { root, html, integrity };
}

function fakeFetch(f, overrides = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const isIntegrity = new URL(url).pathname.endsWith('/INTEGRITY.json');
    const body = isIntegrity ? f.integrity : f.html;
    const headers = {
      'content-type': isIntegrity ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-robots-tag': 'noindex, nofollow, noarchive',
      ...(isIntegrity ? {} : { 'content-security-policy': csp }),
      ...(overrides.headers || {})
    };
    const response = new Response(overrides.bodyFor ? overrides.bodyFor({ url, isIntegrity, body }) : body, {
      status: overrides.status ?? 200,
      headers
    });
    Object.defineProperty(response, 'url', { value: overrides.responseUrl ?? String(url) });
    return response;
  };
  return { fetchImpl, calls };
}

test('read-only staging probe verifies exact HTTPS HTML and integrity bytes with required response headers', async t => {
  const f = fixture(t);
  const { fetchImpl, calls } = fakeFetch(f);
  const result = await probeStaging('https://staging.example/dadyar-preview/', f.root, fetchImpl, 'https://staging.example');
  assert.equal(result.status, 'STAGING_HTTPS_PROBE_VERIFIED_NOT_RELEASE_AUTHORIZED');
  assert.equal(result.sourceCommit, 'a'.repeat(40));
  assert.equal(result.htmlSha256, sha256(f.html));
  assert.equal(result.integritySha256, sha256(f.integrity));
  assert.equal(result.releaseStatus, 'NOT_READY');
  assert.equal(result.apiEnabled, false);
  assert.equal(result.publicAiEnabled, false);
  assert.equal(result.deploymentAuthorized, false);
  assert.deepEqual(calls.map(call => new URL(call.url).pathname), [
    '/dadyar-preview/',
    '/dadyar-preview/INTEGRITY.json'
  ]);
  for (const call of calls) {
    assert.equal(call.options.method, 'GET');
    assert.equal(call.options.redirect, 'manual');
    assert.equal(call.options.credentials, 'omit');
    assert.equal(call.options.cache, 'no-store');
  }
});

test('probe refuses HTTP, query strings, credentials and any path other than the exact preview route before network access', async t => {
  const f = fixture(t);
  const { fetchImpl, calls } = fakeFetch(f);
  for (const url of [
    'http://staging.example/dadyar-preview/',
    'https://user:pass@staging.example/dadyar-preview/',
    'https://staging.example/dadyar-preview/?x=1',
    'https://staging.example/other/'
  ]) {
    await assert.rejects(() => probeStaging(url, f.root, fetchImpl, 'https://staging.example'));
  }
  assert.equal(calls.length, 0);
});

test('probe requires an explicit canonical staging-origin allowlist before network access', async t => {
  const f = fixture(t);
  const { fetchImpl, calls } = fakeFetch(f);
  await assert.rejects(
    () => probeStaging('https://staging.example/dadyar-preview/', f.root, fetchImpl, null),
    /staging_origin_allowlist_required/
  );
  await assert.rejects(
    () => probeStaging('https://staging.example/dadyar-preview/', f.root, fetchImpl, 'http://staging.example'),
    /staging_origin_allowlist_must_be_canonical_https_origin/
  );
  await assert.rejects(
    () => probeStaging('https://staging.example/dadyar-preview/', f.root, fetchImpl, 'https://other.example'),
    /staging_origin_not_allowlisted/
  );
  await assert.rejects(
    () => probeStaging('https://staging.example/dadyar-preview/', f.root, fetchImpl, 'https://staging.example/preview'),
    /staging_origin_allowlist_must_be_canonical_https_origin/
  );
  assert.equal(calls.length, 0);
});

test('probe refuses the live apex and www production hosts before network access', async t => {
  const f = fixture(t);
  const { fetchImpl, calls } = fakeFetch(f);
  for (const host of ['mehdisehat.ir', 'www.mehdisehat.ir', 'mehdisehat.ir.']) {
    const origin = 'https://' + host;
    await assert.rejects(
      () => probeStaging(origin + '/dadyar-preview/', f.root, fetchImpl, origin),
      /staging_production_origin_forbidden/
    );
  }
  assert.equal(calls.length, 0);
});

test('probe rejects missing or mismatched final response URLs', async t => {
  const f = fixture(t);
  const missing = fakeFetch(f, { responseUrl: '' });
  await assert.rejects(
    () => probeStaging('https://staging.example/dadyar-preview/', f.root, missing.fetchImpl, 'https://staging.example'),
    /preview_html_final_url_missing_or_mismatch/
  );
  const mismatched = fakeFetch(f, { responseUrl: 'https://other.example/dadyar-preview/' });
  await assert.rejects(
    () => probeStaging('https://staging.example/dadyar-preview/', f.root, mismatched.fetchImpl, 'https://staging.example'),
    /preview_html_final_url_missing_or_mismatch/
  );
});

test('probe rejects redirects and non-200 responses', async t => {
  const f = fixture(t);
  const redirect = fakeFetch(f, { status: 302 });
  await assert.rejects(() => probeStaging('https://staging.example/dadyar-preview/', f.root, redirect.fetchImpl, 'https://staging.example'), /preview_html_http_status_not_200:302/);
  const missing = fakeFetch(f, { status: 404 });
  await assert.rejects(() => probeStaging('https://staging.example/dadyar-preview/', f.root, missing.fetchImpl, 'https://staging.example'), /preview_html_http_status_not_200:404/);
});

test('probe rejects missing no-store and security headers', async t => {
  const f = fixture(t);
  const { fetchImpl } = fakeFetch(f, { headers: { 'cache-control': 'public, max-age=3600' } });
  await assert.rejects(() => probeStaging('https://staging.example/dadyar-preview/', f.root, fetchImpl, 'https://staging.example'), /preview_html_cache_control_no_store_missing/);
  const { fetchImpl: weakFetch } = fakeFetch(f, { headers: { 'x-content-type-options': 'sniff' } });
  await assert.rejects(() => probeStaging('https://staging.example/dadyar-preview/', f.root, weakFetch, 'https://staging.example'), /preview_html_nosniff_missing/);
});

test('probe rejects MIME types that merely share an expected prefix', async t => {
  const f = fixture(t);
  for (const contentType of [
    'text/html-evil; charset=utf-8',
    'text/htmlx',
    'application/jsonp; charset=utf-8',
    'text/html, application/json'
  ]) {
    const { fetchImpl, calls } = fakeFetch(f, { headers: { 'content-type': contentType } });
    await assert.rejects(
      () => probeStaging('https://staging.example/dadyar-preview/', f.root, fetchImpl, 'https://staging.example'),
      /preview_html_content_type_mismatch/
    );
    assert.equal(calls.length, 1);
  }
});

test('probe rejects a CSP that differs from the reviewed local HTML', async t => {
  const f = fixture(t);
  const { fetchImpl } = fakeFetch(f, { headers: { 'content-security-policy': "default-src 'self'" } });
  await assert.rejects(() => probeStaging('https://staging.example/dadyar-preview/', f.root, fetchImpl, 'https://staging.example'), /preview_html_content_security_policy_mismatch/);
});

test('probe rejects changed remote HTML and integrity bytes', async t => {
  const f = fixture(t);
  const { fetchImpl } = fakeFetch(f, {
    bodyFor: ({ isIntegrity, body }) => { if (isIntegrity) return body; const changed = Buffer.from(body); changed[0] ^= 1; return changed; }
  });
  await assert.rejects(() => probeStaging('https://staging.example/dadyar-preview/', f.root, fetchImpl, 'https://staging.example'), /preview_html_body_bytes_mismatch/);
});

test('probe rejects cookies and unexpected local files', async t => {
  const f = fixture(t);
  const { fetchImpl } = fakeFetch(f, { headers: { 'set-cookie': 'session=unexpected' } });
  await assert.rejects(() => probeStaging('https://staging.example/dadyar-preview/', f.root, fetchImpl, 'https://staging.example'), /preview_html_set_cookie_forbidden/);
  fs.writeFileSync(path.join(f.root, 'backup.zip'), 'synthetic');
  const { fetchImpl: cleanFetch, calls } = fakeFetch(f);
  await assert.rejects(() => probeStaging('https://staging.example/dadyar-preview/', f.root, cleanFetch, 'https://staging.example'), /artifact_file_set_mismatch/);
  assert.equal(calls.length, 0);
});

test('probe rejects a manifest that attempts to authorize API, public AI or deployment', async t => {
  const f = fixture(t);
  const manifest = JSON.parse(f.integrity.toString('utf8'));
  manifest.release.apiEnabled = true;
  fs.writeFileSync(path.join(f.root, 'INTEGRITY.json'), JSON.stringify(manifest, null, 2) + '\n');
  const { fetchImpl, calls } = fakeFetch(f);
  await assert.rejects(() => probeStaging('https://staging.example/dadyar-preview/', f.root, fetchImpl, 'https://staging.example'), /artifact_release_boundary_mismatch/);
  assert.equal(calls.length, 0);
});

test('probe rejects symlinked artifact members', async t => {
  const f = fixture(t);
  const htmlPath = path.join(f.root, 'index.html');
  const external = path.join(path.dirname(f.root), 'external-' + path.basename(f.root) + '.html');
  t.after(() => fs.rmSync(external, { force: true }));
  fs.copyFileSync(htmlPath, external);
  fs.unlinkSync(htmlPath);
  fs.symlinkSync(external, htmlPath);
  const { fetchImpl, calls } = fakeFetch(f);
  await assert.rejects(() => probeStaging('https://staging.example/dadyar-preview/', f.root, fetchImpl, 'https://staging.example'), /artifact_index\.html_symlink_forbidden/);
  assert.equal(calls.length, 0);
});
test('probe rejects hard-linked artifact members before any network request', async t => {
  const f = fixture(t);
  const htmlPath = path.join(f.root, 'index.html');
  const external = path.join(path.dirname(f.root), 'hardlink-' + path.basename(f.root) + '.html');
  t.after(() => fs.rmSync(external, { force: true }));
  fs.linkSync(htmlPath, external);
  const { fetchImpl, calls } = fakeFetch(f);
  await assert.rejects(() => probeStaging('https://staging.example/dadyar-preview/', f.root, fetchImpl, 'https://staging.example'), /artifact_hardlink_forbidden:index\.html/);
  assert.equal(calls.length, 0);
});

test('probe cancels oversized response bodies before buffering beyond the reviewed artifact size', async t => {
  const f = fixture(t);
  const { fetchImpl, calls } = fakeFetch(f, {
    bodyFor: ({ isIntegrity, body }) => isIntegrity ? body : Buffer.concat([body, Buffer.alloc(1024 * 1024)])
  });
  await assert.rejects(
    () => probeStaging('https://staging.example/dadyar-preview/', f.root, fetchImpl, 'https://staging.example'),
    /preview_html_body_too_large/
  );
  assert.equal(calls.length, 1);
});


test('probe rejects IP literals, single-label and local-only hostnames before network access', async t => {
  const f = fixture(t);
  const { fetchImpl, calls } = fakeFetch(f);
  const cases = [
    ['127.0.0.1', /staging_ip_literal_forbidden/],
    ['[::1]', /staging_ip_literal_forbidden/],
    ['localhost', /staging_local_hostname_forbidden/],
    ['preview.localhost', /staging_local_hostname_forbidden/],
    ['db.local', /staging_local_hostname_forbidden/],
    ['db.local.', /staging_local_hostname_forbidden/],
    ['metadata.google.internal.', /staging_local_hostname_forbidden/],
    ['metadata.google.internal', /staging_local_hostname_forbidden/],
    ['preview.lan', /staging_local_hostname_forbidden/],
    ['staging', /staging_fully_qualified_hostname_required/]
  ];
  for (const [host, expected] of cases) {
    const origin = 'https://' + host;
    await assert.rejects(
      () => probeStaging(origin + '/dadyar-preview/', f.root, fetchImpl, origin),
      expected
    );
  }
  assert.equal(calls.length, 0);
});


test('staging DNS rejects loopback, private, link-local, documentation, multicast and non-global IPv6 answers', async () => {
  const blocked = [
    ['127.0.0.1', 4], ['10.0.0.1', 4], ['172.16.0.1', 4], ['192.168.1.1', 4],
    ['169.254.169.254', 4], ['100.64.0.1', 4], ['192.0.2.10', 4],
    ['198.51.100.7', 4], ['203.0.113.9', 4], ['224.0.0.1', 4],
    ['240.0.0.1', 4], ['::1', 6], ['fc00::1', 6], ['fe80::1', 6],
    ['ff02::1', 6], ['2001:db8::1', 6], ['::ffff:127.0.0.1', 6]
  ];
  for (const [address, family] of blocked) {
    await assert.rejects(
      () => resolvePublicStagingAddresses('staging.example', async () => [{ address, family }]),
      /staging_dns_non_public_address/
    );
  }
  await assert.rejects(
    () => resolvePublicStagingAddresses('staging.example', async () => [
      { address: '1.1.1.1', family: 4 },
      { address: '169.254.169.254', family: 4 }
    ]),
    /staging_dns_non_public_address/
  );
});

test('staging DNS accepts public addresses and the pinned lookup never re-resolves another host', async () => {
  const addresses = await resolvePublicStagingAddresses('staging.example', async () => [
    { address: '1.1.1.1', family: 4 },
    { address: '2606:4700:4700::1111', family: 6 }
  ]);
  assert.deepEqual(addresses, [
    { address: '1.1.1.1', family: 4 },
    { address: '2606:4700:4700::1111', family: 6 }
  ]);
  const lookup = createPinnedLookup('staging.example', '1.1.1.1');
  const resolved = await new Promise((resolve, reject) => {
    lookup('staging.example', { all: true }, (error, records) => error ? reject(error) : resolve(records));
  });
  assert.deepEqual(resolved, [{ address: '1.1.1.1', family: 4 }]);
  await assert.rejects(
    () => new Promise((resolve, reject) => {
      lookup('other.example', { all: true }, error => error ? reject(error) : resolve());
    }),
    /staging_dns_host_mismatch/
  );
});

test('default staging probe pins both HTTPS GETs to one public DNS answer and prevents rebinding', async t => {
  const f = fixture(t);
  let dnsCalls = 0;
  const pinnedAddresses = [];
  const requestOptions = [];
  const lookup = async () => {
    dnsCalls += 1;
    return dnsCalls === 1
      ? [{ address: '1.1.1.1', family: 4 }]
      : [{ address: '169.254.169.254', family: 4 }];
  };
  const requestImpl = (urlValue, options) => {
    requestOptions.push(options);
    options.lookup(new URL(urlValue).hostname, { all: true }, (error, records) => {
      if (error) throw error;
      pinnedAddresses.push(records[0].address);
    });
    const request = new EventEmitter();
    request.setTimeout = () => {};
    request.destroy = error => request.emit('error', error);
    request.end = () => {
      const isIntegrity = new URL(urlValue).pathname.endsWith('/INTEGRITY.json');
      const body = isIntegrity ? f.integrity : f.html;
      const response = Readable.from([body]);
      response.statusCode = 200;
      response.headers = {
        'content-type': isIntegrity ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        'x-robots-tag': 'noindex, nofollow, noarchive',
        ...(isIntegrity ? {} : { 'content-security-policy': csp })
      };
      request.emit('response', response);
    };
    return request;
  };
  const result = await probeStaging(
    'https://staging.example/dadyar-preview/',
    f.root,
    undefined,
    'https://staging.example',
    lookup,
    requestImpl
  );
  assert.equal(dnsCalls, 1, 'system DNS must be consulted exactly once');
  assert.deepEqual(pinnedAddresses, ['1.1.1.1', '1.1.1.1']);
  assert.equal(requestOptions.length, 2);
  for (const options of requestOptions) {
    assert.equal(options.servername, 'staging.example');
    assert.equal(options.rejectUnauthorized, true);
    assert.equal(options.agent, false);
  }
  assert.equal(result.networkTargetPinned, true);
  assert.equal(result.pinnedAddressFamily, 4);
  assert.equal(result.dnsAddressCount, 1);
});

test('default staging probe rejects a private DNS answer before opening any HTTPS request', async t => {
  const f = fixture(t);
  let requests = 0;
  await assert.rejects(
    () => probeStaging(
      'https://staging.example/dadyar-preview/',
      f.root,
      undefined,
      'https://staging.example',
      async () => [{ address: '10.10.0.5', family: 4 }],
      () => { requests += 1; throw new Error('network_must_not_start'); }
    ),
    /staging_dns_non_public_address/
  );
  assert.equal(requests, 0);
});
