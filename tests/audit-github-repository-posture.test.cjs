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
      commit: { sha: 'a'.repeat(40) },
      protection: {
        enabled: true,
        required_status_checks: {
          enforcement_level: 'everyone',
          contexts: ['Dadyar stage-0 experimental CI / ' + REQUIRED_CHECK]
        },
        required_pull_request_reviews: {
          required_approving_review_count: 1,
          dismiss_stale_reviews: true
        },
        enforce_admins: { enabled: true }
      }
    }
  };
}

function fakeFetch(fixtures, seen = []) {
  return async (url, options) => {
    seen.push({ url, options });
    if (url.endsWith('/repos/' + EXPECTED_REPOSITORY)) return response(fixtures.repository);
    if (url.endsWith('/branches/' + encodeURIComponent(EXPECTED_BRANCH))) return response(fixtures.branch);
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

test('blocks an unprotected release branch even when repository visibility is private', async () => {
  const fixtures = verifiedFixtures();
  fixtures.branch.protected = false;
  fixtures.branch.protection.enabled = false;
  const result = await auditRepositoryPosture({ fetchImpl: fakeFetch(fixtures) });
  assert.equal(result.status, 'NOT_READY');
  assert.ok(result.blockers.includes('release_branch_protection_disabled'));
  assert.ok(result.blockers.includes('branch_protection_details_unavailable'));
});

test('requires the exact CI check, at least one stale-dismissed review and admin enforcement', async () => {
  const cases = [
    ['missing CI', f => { f.branch.protection.required_status_checks.contexts = []; }, 'required_dadyar_ci_check_not_enforced'],
    ['loose CI enforcement', f => { f.branch.protection.required_status_checks.enforcement_level = 'off'; }, 'required_dadyar_ci_check_not_enforced'],
    ['no required review', f => { f.branch.protection.required_pull_request_reviews.required_approving_review_count = 0; }, 'independent_pull_request_review_policy_missing'],
    ['stale reviews retained', f => { f.branch.protection.required_pull_request_reviews.dismiss_stale_reviews = false; }, 'independent_pull_request_review_policy_missing'],
    ['admins exempt', f => { f.branch.protection.enforce_admins.enabled = false; }, 'branch_protection_not_enforced_for_admins']
  ];
  for (const [label, mutate, blocker] of cases) {
    const fixtures = verifiedFixtures();
    mutate(fixtures);
    const result = await auditRepositoryPosture({ fetchImpl: fakeFetch(fixtures) });
    assert.equal(result.status, 'NOT_READY', label);
    assert.ok(result.blockers.includes(blocker), label);
  }
});

test('fails closed when GitHub API access is unavailable or permission is insufficient', async () => {
  const result = await auditRepositoryPosture({
    fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) })
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
  assert.equal(seen.length, 2);
  assert.ok(seen.every(item => item.options.method === 'GET'));
  assert.ok(seen.every(item => item.options.headers.authorization === 'Bearer synthetic-github-token-never-logged'));
  assert.equal(JSON.stringify(result).includes('synthetic-github-token-never-logged'), false);
});
