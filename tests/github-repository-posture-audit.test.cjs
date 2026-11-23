'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EXPECTED_REPOSITORY,
  EXPECTED_BRANCH,
  REQUIRED_CHECK,
  inspectPosture,
  auditRepositoryPosture,
  classifyGitHubReadFailure
} = require('../scripts/audit-github-repository-posture.cjs');

const repoInfo = () => ({ full_name: EXPECTED_REPOSITORY, private: true });
const branchInfo = () => ({
  name: EXPECTED_BRANCH,
  protected: true,
  commit: { sha: 'a'.repeat(40) }
});
const protectionInfo = () => ({
  required_status_checks: { contexts: [REQUIRED_CHECK], strict: true },
  required_pull_request_reviews: {
    required_approving_review_count: 1,
    dismiss_stale_reviews: true
  },
  enforce_admins: { enabled: true },
  allow_force_pushes: { enabled: false },
  allow_deletions: { enabled: false },
  required_conversation_resolution: { enabled: true }
});

test('only a private repository with strict CI, independent review and non-destructive protection passes', () => {
  const result = inspectPosture(
    EXPECTED_REPOSITORY,
    EXPECTED_BRANCH,
    repoInfo(),
    branchInfo(),
    protectionInfo()
  );
  assert.equal(result.status, 'POSTURE_VERIFIED');
  assert.equal(result.visibility, 'private');
  assert.equal(result.branchProtected, true);
  assert.equal(result.headSha, 'a'.repeat(40));
  assert.deepEqual(result.blockers, []);
  assert.equal(result.deploymentAuthorized, false);
});

test('a public repository remains blocked even when branch rules are otherwise complete', () => {
  const result = inspectPosture(
    EXPECTED_REPOSITORY,
    EXPECTED_BRANCH,
    { ...repoInfo(), private: false },
    branchInfo(),
    protectionInfo()
  );
  assert.equal(result.status, 'NOT_READY');
  assert.ok(result.blockers.includes('repository_must_be_private'));
  assert.equal(result.deploymentAuthorized, false);
});

test('force-push permission must be explicitly disabled', () => {
  for (const allowForcePushes of [undefined, { enabled: true }]) {
    const protection = protectionInfo();
    protection.allow_force_pushes = allowForcePushes;
    const result = inspectPosture(EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(), protection);
    assert.ok(result.blockers.includes('force_pushes_must_be_disabled'));
    assert.equal(result.deploymentAuthorized, false);
  }
});

test('branch deletion permission must be explicitly disabled', () => {
  for (const allowDeletions of [undefined, { enabled: true }]) {
    const protection = protectionInfo();
    protection.allow_deletions = allowDeletions;
    const result = inspectPosture(EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(), protection);
    assert.ok(result.blockers.includes('branch_deletion_must_be_disabled'));
  }
});

test('review conversation resolution must be explicitly required', () => {
  for (const resolution of [undefined, { enabled: false }]) {
    const protection = protectionInfo();
    protection.required_conversation_resolution = resolution;
    const result = inspectPosture(EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(), protection);
    assert.ok(result.blockers.includes('required_review_conversation_resolution_missing'));
  }
});

test('missing or stale CI and independent review requirements remain blockers', () => {
  const noStrictChecks = protectionInfo();
  noStrictChecks.required_status_checks.strict = false;
  assert.ok(inspectPosture(EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(), noStrictChecks)
    .blockers.includes('required_dadyar_ci_check_not_strict'));

  const noApprover = protectionInfo();
  noApprover.required_pull_request_reviews.required_approving_review_count = 0;
  noApprover.required_pull_request_reviews.dismiss_stale_reviews = false;
  const result = inspectPosture(EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(), noApprover);
  assert.ok(result.blockers.includes('independent_pull_request_review_policy_missing'));
});

test('administrator bypass remains blocked', () => {
  const protection = protectionInfo();
  protection.enforce_admins = { enabled: false };
  const result = inspectPosture(EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(), protection);
  assert.ok(result.blockers.includes('branch_protection_not_enforced_for_admins'));
});

test('live posture audit performs read-only GET requests against the exact repository and branch', async () => {
  const calls = [];
  const result = await auditRepositoryPosture({
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method });
      let body;
      if (url === 'https://api.github.com/repos/' + EXPECTED_REPOSITORY) body = repoInfo();
      else if (url.endsWith('/protection')) body = protectionInfo();
      else if (url.includes('/branches/')) body = branchInfo();
      else throw new Error('unexpected_url');
      return { ok: true, json: async () => body };
    }
  });
  assert.equal(result.status, 'POSTURE_VERIFIED');
  assert.equal(result.deploymentAuthorized, false);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call.method === 'GET'));
  assert.ok(calls.every(call => call.url.includes(EXPECTED_REPOSITORY)));
  assert.ok(calls.some(call => call.url.endsWith('/branches/' + encodeURIComponent(EXPECTED_BRANCH) + '/protection')));
});

test('forbidden GitHub access fails closed with a specific blocker', async () => {
  const result = await auditRepositoryPosture({
    fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ message: 'SENSITIVE_RESPONSE_BODY' }) })
  });
  assert.equal(result.status, 'NOT_VERIFIED');
  assert.deepEqual(result.blockers, ['github_api_forbidden_or_permission_insufficient']);
  assert.equal(result.deploymentAuthorized, false);
  assert.equal(JSON.stringify(result).includes('SENSITIVE_RESPONSE_BODY'), false);
});

test('HTTP authentication, hidden-resource, rate-limit and server failures remain distinguishable', () => {
  const cases = [
    [401, 'github_api_authentication_failed'],
    [403, 'github_api_forbidden_or_permission_insufficient'],
    [404, 'github_api_resource_not_found_or_hidden'],
    [429, 'github_api_rate_limited'],
    [500, 'github_api_server_error'],
    [503, 'github_api_server_error'],
    [422, 'github_api_http_error_422']
  ];
  for (const [status, expected] of cases) {
    assert.equal(classifyGitHubReadFailure(new Error('github_api_read_failed_' + status)), expected);
  }
});

test('transport failures are redacted and never authorize deployment', async () => {
  const result = await auditRepositoryPosture({
    fetchImpl: async () => { throw new Error('token=do-not-echo'); }
  });
  assert.equal(result.status, 'NOT_VERIFIED');
  assert.deepEqual(result.blockers, ['github_api_network_or_transport_failure']);
  assert.equal(result.deploymentAuthorized, false);
  assert.equal(JSON.stringify(result).includes('do-not-echo'), false);
});

test('unexpected repository or branch is rejected before any request', async () => {
  let called = false;
  const result = await auditRepositoryPosture({
    repository: 'other/repository',
    fetchImpl: async () => { called = true; throw new Error('must_not_call'); }
  });
  assert.equal(called, false);
  assert.equal(result.status, 'NOT_VERIFIED');
  assert.equal(result.deploymentAuthorized, false);
});
