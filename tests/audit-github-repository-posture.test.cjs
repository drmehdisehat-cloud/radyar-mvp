'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EXPECTED_REPOSITORY,
  EXPECTED_BRANCH,
  REQUIRED_CHECK,
  auditRepositoryPosture
} = require('../scripts/audit-github-repository-posture.cjs');

function response(value) {
  return { ok: true, status: 200, json: async () => value };
}

function verifiedFixtures() {
  return {
    repository: {
      full_name: EXPECTED_REPOSITORY,
      private: true
    },
    branch: {
      name: EXPECTED_BRANCH,
      protected: true,
      commit: { sha: 'a'.repeat(40) }
    },
    protection: {
      required_status_checks: {
        strict: true,
        contexts: [REQUIRED_CHECK]
      },
      required_pull_request_reviews: {
        required_approving_review_count: 1,
        dismiss_stale_reviews: true
      },
      enforce_admins: { enabled: true },
      allow_force_pushes: { enabled: false },
      allow_deletions: { enabled: false },
      required_conversation_resolution: { enabled: true }
    }
  };
}

function fakeFetch(fixtures, seen = []) {
  return async (url, options) => {
    seen.push({ url, options });
    if (url.endsWith('/repos/' + EXPECTED_REPOSITORY)) return response(fixtures.repository);
    const branchUrl = '/branches/' + encodeURIComponent(EXPECTED_BRANCH);
    if (url.endsWith(branchUrl + '/protection')) return response(fixtures.protection);
    if (url.endsWith(branchUrl)) return response(fixtures.branch);
    throw new Error('unexpected_url');
  };
}

test('verifies only a private repository with protected release branch, required CI, review and admin enforcement', async () => {
  const fixtures = verifiedFixtures();
  const result = await auditRepositoryPosture({
    token: 'synthetic-github-token-never-logged',
    fetchImpl: fakeFetch(fixtures)
  });
  assert.equal(result.status, 'POSTURE_VERIFIED');
  assert.equal(result.visibility, 'private');
  assert.equal(result.branchProtected, true);
  assert.equal(result.headSha, 'a'.repeat(40));
  assert.deepEqual(result.blockers, []);
  assert.equal(result.deploymentAuthorized, false);
});

test('blocks the currently public repository posture', async () => {
  const fixtures = verifiedFixtures();
  fixtures.repository.private = false;
  const result = await auditRepositoryPosture({ fetchImpl: fakeFetch(fixtures) });
  assert.equal(result.status, 'NOT_READY');
  assert.ok(result.blockers.includes('repository_must_be_private'));
  assert.equal(result.deploymentAuthorized, false);
});

test('reports unknown repository visibility without mislabelling it public', async () => {
  const fixtures = verifiedFixtures();
  delete fixtures.repository.private;
  const result = await auditRepositoryPosture({ fetchImpl: fakeFetch(fixtures) });
  assert.equal(result.status, 'NOT_READY');
  assert.equal(result.visibility, 'unknown');
  assert.ok(result.blockers.includes('repository_visibility_unavailable'));
  assert.ok(!result.blockers.includes('repository_must_be_private'));
});

test('reports unknown branch protection without claiming it is disabled', async () => {
  const fixtures = verifiedFixtures();
  delete fixtures.branch.protected;
  const result = await auditRepositoryPosture({ fetchImpl: fakeFetch(fixtures) });
  assert.equal(result.status, 'NOT_READY');
  assert.equal(result.branchProtected, null);
  assert.ok(result.blockers.includes('release_branch_protection_status_unavailable'));
  assert.ok(!result.blockers.includes('release_branch_protection_disabled'));
});

test('blocks an unprotected release branch even when repository visibility is private', async () => {
  const fixtures = verifiedFixtures();
  fixtures.branch.protected = false;
  const result = await auditRepositoryPosture({ fetchImpl: fakeFetch(fixtures) });
  assert.equal(result.status, 'NOT_READY');
  assert.ok(result.blockers.includes('release_branch_protection_disabled'));
});

test('requires the exact CI check, at least one stale-dismissed review and admin enforcement', async () => {
  const cases = [
    ['missing CI', f => { f.protection.required_status_checks.contexts = []; }, 'required_dadyar_ci_check_not_enforced'],
    ['loose CI context', f => { f.protection.required_status_checks.contexts = ['some-other-check']; }, 'required_dadyar_ci_check_not_enforced'],
    ['spoofed workflow with the expected job suffix', f => { f.protection.required_status_checks.contexts = ['Untrusted workflow / verify-existing-frontend']; }, 'required_dadyar_ci_check_not_enforced'],
    ['non-strict required check', f => { f.protection.required_status_checks.strict = false; }, 'required_dadyar_ci_check_not_strict'],
    ['missing strictness declaration', f => { delete f.protection.required_status_checks.strict; }, 'required_dadyar_ci_check_not_strict'],
    ['no required review', f => { f.protection.required_pull_request_reviews.required_approving_review_count = 0; }, 'independent_pull_request_review_policy_missing'],
    ['stale reviews retained', f => { f.protection.required_pull_request_reviews.dismiss_stale_reviews = false; }, 'independent_pull_request_review_policy_missing'],
    ['admins exempt', f => { f.protection.enforce_admins.enabled = false; }, 'branch_protection_not_enforced_for_admins']
  ];
  for (const [label, mutate, blocker] of cases) {
    const fixtures = verifiedFixtures();
    mutate(fixtures);
    const result = await auditRepositoryPosture({ fetchImpl: fakeFetch(fixtures) });
    assert.equal(result.status, 'NOT_READY', label);
    assert.ok(result.blockers.includes(blocker), label);
  }
});

test('requires force-push and deletion to be disabled and review conversations to be resolved', async () => {
  const cases = [
    ['force pushes allowed', f => { f.protection.allow_force_pushes.enabled = true; }, 'force_pushes_must_be_disabled'],
    ['force-push policy missing', f => { delete f.protection.allow_force_pushes; }, 'force_pushes_must_be_disabled'],
    ['branch deletion allowed', f => { f.protection.allow_deletions.enabled = true; }, 'branch_deletion_must_be_disabled'],
    ['deletion policy missing', f => { delete f.protection.allow_deletions; }, 'branch_deletion_must_be_disabled'],
    ['review conversation resolution disabled', f => { f.protection.required_conversation_resolution.enabled = false; }, 'required_review_conversation_resolution_missing'],
    ['review conversation policy missing', f => { delete f.protection.required_conversation_resolution; }, 'required_review_conversation_resolution_missing']
  ];
  for (const [label, mutate, blocker] of cases) {
    const fixtures = verifiedFixtures();
    mutate(fixtures);
    const result = await auditRepositoryPosture({ fetchImpl: fakeFetch(fixtures) });
    assert.equal(result.status, 'NOT_READY', label);
    assert.ok(result.blockers.includes(blocker), label);
    assert.equal(result.deploymentAuthorized, false);
  }
});

test('fails closed when GitHub API access or branch-protection permission is unavailable', async () => {
  const fixtures = verifiedFixtures();
  const result = await auditRepositoryPosture({
    fetchImpl: async url => {
      if (url.endsWith('/branches/' + encodeURIComponent(EXPECTED_BRANCH) + '/protection')) {
        return { ok: false, status: 403, json: async () => ({}) };
      }
      if (url.endsWith('/repos/' + EXPECTED_REPOSITORY)) return response(fixtures.repository);
      return response(fixtures.branch);
    }
  });
  assert.equal(result.status, 'NOT_VERIFIED');
  assert.deepEqual(result.blockers, ['github_api_read_failed_or_permission_insufficient']);
  assert.equal(result.deploymentAuthorized, false);
});

test('does not inspect an unexpected repository or branch', async () => {
  let calls = 0;
  const result = await auditRepositoryPosture({
    repository: 'someone-else/repository',
    fetchImpl: async () => { calls += 1; throw new Error('must not fetch'); }
  });
  assert.equal(calls, 0);
  assert.equal(result.status, 'NOT_VERIFIED');
  assert.ok(result.blockers.includes('unexpected_repository_or_release_branch'));
});

test('uses read-only GET requests and never emits the token in the result', async () => {
  const seen = [];
  const fixtures = verifiedFixtures();
  const result = await auditRepositoryPosture({
    token: 'synthetic-github-token-never-logged',
    fetchImpl: fakeFetch(fixtures, seen)
  });
  assert.equal(seen.length, 3);
  assert.ok(seen.every(item => item.options.method === 'GET'));
  assert.ok(seen.every(item => item.options.headers.authorization === 'Bearer synthetic-github-token-never-logged'));
  assert.equal(JSON.stringify(result).includes('synthetic-github-token-never-logged'), false);
});
