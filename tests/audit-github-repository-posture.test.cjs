'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EXPECTED_REPOSITORY,
  EXPECTED_BRANCH,
  REQUIRED_CHECK,
  REQUIRED_CHECK_RUN,
  REQUIRED_WORKFLOW_ID,
  REQUIRED_WORKFLOW_PATH,
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
    },
    checkRuns: {
      total_count: 1,
      check_runs: [{
        id: 456,
        name: REQUIRED_CHECK_RUN,
        head_sha: 'a'.repeat(40),
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-11-23T10:00:00Z',
        completed_at: '2026-11-23T10:00:30Z',
        app: { slug: 'github-actions' },
        check_suite: { id: 123 }
      }]
    },
    workflowRuns: {
      total_count: 1,
      workflow_runs: [{
        id: 789,
        workflow_id: REQUIRED_WORKFLOW_ID,
        path: REQUIRED_WORKFLOW_PATH,
        event: 'push',
        head_branch: EXPECTED_BRANCH,
        head_sha: 'a'.repeat(40),
        status: 'completed',
        conclusion: 'success',
        check_suite_id: 123,
        run_started_at: '2026-11-23T10:00:00Z',
        created_at: '2026-11-23T10:00:00Z'
      }]
    }
  };
}

function fakeFetch(fixtures, seen = []) {
  return async (url, options) => {
    seen.push({ url, options });
    if (url.endsWith('/repos/' + EXPECTED_REPOSITORY)) return response(fixtures.repository);
    const branchUrl = '/branches/' + encodeURIComponent(EXPECTED_BRANCH);
    if (url.includes('/check-runs?per_page=100')) return response(fixtures.checkRuns);
    if (url.includes('/actions/runs?head_sha=')) return response(fixtures.workflowRuns);
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
  assert.equal(result.requiredWorkflowRunId, 789);
  assert.equal(result.requiredWorkflowRunHeadSha, 'a'.repeat(40));
  assert.equal(result.requiredWorkflowRunConclusion, 'success');
  assert.equal(result.requiredWorkflowCheckSuiteId, 123);
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
  assert.deepEqual(result.blockers, ['github_api_forbidden_or_permission_insufficient']);
  assert.equal(result.deploymentAuthorized, false);
});

test('blocks an in-progress exact-head check even when an older successful run exists', async () => {
  const fixtures = verifiedFixtures();
  fixtures.checkRuns.total_count = 2;
  fixtures.checkRuns.check_runs.push({
    id: 457,
    name: REQUIRED_CHECK_RUN,
    head_sha: 'a'.repeat(40),
    status: 'in_progress',
    conclusion: null,
    started_at: '2026-11-23T10:01:00Z',
    completed_at: null,
    app: { slug: 'github-actions' },
    check_suite: { id: 123 }
  });
  const result = await auditRepositoryPosture({ fetchImpl: fakeFetch(fixtures) });
  assert.equal(result.status, 'NOT_READY');
  assert.ok(result.blockers.includes('required_ci_check_not_successful_on_exact_head'));
  assert.equal(result.requiredCheckRunId, 457);
  assert.equal(result.deploymentAuthorized, false);
});


test('rejects a same-named check run from a different workflow check suite', async () => {
  const fixtures = verifiedFixtures();
  fixtures.checkRuns.check_runs[0].check_suite.id = 999;
  const result = await auditRepositoryPosture({ fetchImpl: fakeFetch(fixtures) });
  assert.equal(result.status, 'NOT_READY');
  assert.ok(result.blockers.includes('required_ci_check_not_successful_on_exact_head'));
  assert.equal(result.deploymentAuthorized, false);
});

test('requires the exact workflow ID, path, push event and branch for the release CI run', async () => {
  const cases = [
    ['different workflow ID', run => { run.workflow_id = REQUIRED_WORKFLOW_ID + 1; }],
    ['different workflow file', run => { run.path = '.github/workflows/other.yml'; }],
    ['pull-request event only', run => { run.event = 'pull_request'; }],
    ['different branch', run => { run.head_branch = 'dadyar/untrusted'; }]
  ];
  for (const [label, mutate] of cases) {
    const fixtures = verifiedFixtures();
    mutate(fixtures.workflowRuns.workflow_runs[0]);
    const result = await auditRepositoryPosture({ fetchImpl: fakeFetch(fixtures) });
    assert.equal(result.status, 'NOT_READY', label);
    assert.ok(result.blockers.includes('required_workflow_run_not_successful_on_exact_head'), label);
    assert.equal(result.deploymentAuthorized, false);
  }
});

test('blocks a newer in-progress trusted workflow run even when an older push run succeeded', async () => {
  const fixtures = verifiedFixtures();
  fixtures.workflowRuns.total_count = 2;
  fixtures.workflowRuns.workflow_runs.push({
    id: 790,
    workflow_id: REQUIRED_WORKFLOW_ID,
    path: REQUIRED_WORKFLOW_PATH,
    event: 'push',
    head_branch: EXPECTED_BRANCH,
    head_sha: 'a'.repeat(40),
    status: 'in_progress',
    conclusion: null,
    check_suite_id: 124,
    run_started_at: '2026-11-23T10:01:00Z',
    created_at: '2026-11-23T10:01:00Z'
  });
  const result = await auditRepositoryPosture({ fetchImpl: fakeFetch(fixtures) });
  assert.equal(result.status, 'NOT_READY');
  assert.ok(result.blockers.includes('required_workflow_run_not_successful_on_exact_head'));
  assert.equal(result.requiredWorkflowRunId, 790);
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
  assert.equal(seen.length, 5);
  assert.ok(seen.some(item => item.url.endsWith('/commits/' + 'a'.repeat(40) + '/check-runs?per_page=100')));
  assert.ok(seen.some(item => item.url.endsWith('/actions/runs?head_sha=' + 'a'.repeat(40) + '&per_page=100')));
  assert.ok(seen.every(item => item.options.method === 'GET'));
  assert.ok(seen.every(item => item.options.headers.authorization === 'Bearer synthetic-github-token-never-logged'));
  assert.equal(JSON.stringify(result).includes('synthetic-github-token-never-logged'), false);
});

for (const [label, mutate, blocker] of [
  ['workflow total_count omitted', fixtures => { delete fixtures.workflowRuns.total_count; }, 'required_workflow_run_observation_incomplete_or_truncated'],
  ['workflow total_count under-reports returned entries', fixtures => { fixtures.workflowRuns.total_count = 0; }, 'required_workflow_run_observation_incomplete_or_truncated'],
  ['check-run total_count omitted', fixtures => { delete fixtures.checkRuns.total_count; }, 'required_ci_check_observation_incomplete_or_truncated'],
  ['check-run total_count under-reports returned entries', fixtures => { fixtures.checkRuns.total_count = 0; }, 'required_ci_check_observation_incomplete_or_truncated'],
  ['workflow total_count over-reports returned entries', fixtures => { fixtures.workflowRuns.total_count = 2; }, 'required_workflow_run_observation_incomplete_or_truncated'],
  ['check-run total_count over-reports returned entries', fixtures => { fixtures.checkRuns.total_count = 2; }, 'required_ci_check_observation_incomplete_or_truncated']
]) {
  test('fails closed when GitHub ' + label, async () => {
    const fixtures = verifiedFixtures();
    mutate(fixtures);
    const result = await auditRepositoryPosture({ fetchImpl: fakeFetch(fixtures) });
    assert.equal(result.status, 'NOT_READY', label);
    assert.ok(result.blockers.includes(blocker), label);
    assert.equal(result.deploymentAuthorized, false);
  });
}
