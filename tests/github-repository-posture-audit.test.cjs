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
const checkRunsInfo = () => ({
  total_count: 1,
  check_runs: [{
    id: 123,
    name: REQUIRED_CHECK_RUN,
    head_sha: 'a'.repeat(40),
    status: 'completed',
    conclusion: 'success',
    started_at: '2026-11-23T10:00:00Z',
    completed_at: '2026-11-23T10:00:30Z',
    app: { slug: 'github-actions' },
    check_suite: { id: 321 }
  }]
});
const workflowRunsInfo = () => ({
  total_count: 1,
  workflow_runs: [{
    id: 456,
    workflow_id: REQUIRED_WORKFLOW_ID,
    path: REQUIRED_WORKFLOW_PATH,
    event: 'push',
    head_branch: EXPECTED_BRANCH,
    head_sha: 'a'.repeat(40),
    status: 'completed',
    conclusion: 'success',
    check_suite_id: 321,
    run_started_at: '2026-11-23T10:00:00Z',
    created_at: '2026-11-23T10:00:00Z'
  }]
});

test('only a private repository with strict CI, independent review and non-destructive protection passes', () => {
  const result = inspectPosture(
    EXPECTED_REPOSITORY,
    EXPECTED_BRANCH,
    repoInfo(),
    branchInfo(),
    protectionInfo(),
    checkRunsInfo(),
    workflowRunsInfo()
  );
  assert.equal(result.status, 'POSTURE_VERIFIED');
  assert.equal(result.visibility, 'private');
  assert.equal(result.branchProtected, true);
  assert.equal(result.headSha, 'a'.repeat(40));
  assert.deepEqual(result.blockers, []);
  assert.equal(result.deploymentAuthorized, false);
  assert.equal(typeof result.observedAt, 'string');
  assert.ok(Number.isFinite(Date.parse(result.observedAt)));
});

test('a public repository remains blocked even when branch rules are otherwise complete', () => {
  const result = inspectPosture(
    EXPECTED_REPOSITORY,
    EXPECTED_BRANCH,
    { ...repoInfo(), private: false },
    branchInfo(),
    protectionInfo(),
    checkRunsInfo(),
    workflowRunsInfo()
  );
  assert.equal(result.status, 'NOT_READY');
  assert.ok(result.blockers.includes('repository_must_be_private'));
  assert.equal(result.deploymentAuthorized, false);
});

test('force-push permission must be explicitly disabled', () => {
  for (const allowForcePushes of [undefined, { enabled: true }]) {
    const protection = protectionInfo();
    protection.allow_force_pushes = allowForcePushes;
    const result = inspectPosture(EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(), protection, checkRunsInfo(), workflowRunsInfo());
    assert.ok(result.blockers.includes('force_pushes_must_be_disabled'));
    assert.equal(result.deploymentAuthorized, false);
  }
});

test('branch deletion permission must be explicitly disabled', () => {
  for (const allowDeletions of [undefined, { enabled: true }]) {
    const protection = protectionInfo();
    protection.allow_deletions = allowDeletions;
    const result = inspectPosture(EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(), protection, checkRunsInfo(), workflowRunsInfo());
    assert.ok(result.blockers.includes('branch_deletion_must_be_disabled'));
  }
});

test('review conversation resolution must be explicitly required', () => {
  for (const resolution of [undefined, { enabled: false }]) {
    const protection = protectionInfo();
    protection.required_conversation_resolution = resolution;
    const result = inspectPosture(EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(), protection, checkRunsInfo(), workflowRunsInfo());
    assert.ok(result.blockers.includes('required_review_conversation_resolution_missing'));
  }
});

test('missing or stale CI and independent review requirements remain blockers', () => {
  const noStrictChecks = protectionInfo();
  noStrictChecks.required_status_checks.strict = false;
  assert.ok(inspectPosture(EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(), noStrictChecks, checkRunsInfo(), workflowRunsInfo())
    .blockers.includes('required_dadyar_ci_check_not_strict'));

  const noApprover = protectionInfo();
  noApprover.required_pull_request_reviews.required_approving_review_count = 0;
  noApprover.required_pull_request_reviews.dismiss_stale_reviews = false;
  const result = inspectPosture(EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(), noApprover, checkRunsInfo(), workflowRunsInfo());
  assert.ok(result.blockers.includes('independent_pull_request_review_policy_missing'));
});

test('administrator bypass remains blocked', () => {
  const protection = protectionInfo();
  protection.enforce_admins = { enabled: false };
  const result = inspectPosture(EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(), protection, checkRunsInfo(), workflowRunsInfo());
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
      else if (url.includes('/check-runs?')) body = checkRunsInfo();
      else if (url.includes('/actions/runs?head_sha=')) body = workflowRunsInfo();
      else if (url.includes('/branches/')) body = branchInfo();
      else throw new Error('unexpected_url');
      return { ok: true, json: async () => body };
    }
  });
  assert.equal(result.status, 'POSTURE_VERIFIED');
  assert.equal(result.deploymentAuthorized, false);
  assert.equal(calls.length, 5);
  assert.ok(calls.every(call => call.method === 'GET'));
  assert.ok(calls.every(call => call.url.includes(EXPECTED_REPOSITORY)));
  assert.ok(calls.some(call => call.url.endsWith('/branches/' + encodeURIComponent(EXPECTED_BRANCH) + '/protection')));
  assert.ok(calls.some(call => call.url.endsWith('/commits/' + 'a'.repeat(40) + '/check-runs?per_page=100')));
  assert.ok(calls.some(call => call.url.endsWith('/actions/runs?head_sha=' + 'a'.repeat(40) + '&per_page=100')));
});

test('latest required GitHub Actions check run must succeed on the exact branch HEAD', () => {
  const runs = checkRunsInfo();
  runs.total_count = 2;
  runs.check_runs.push({
    id: 124,
    name: REQUIRED_CHECK_RUN,
    head_sha: 'a'.repeat(40),
    status: 'completed',
    conclusion: 'failure',
    started_at: '2026-11-23T10:01:00Z',
    completed_at: '2026-11-23T10:01:20Z',
    app: { slug: 'github-actions' },
    check_suite: { id: 321 }
  });
  const result = inspectPosture(EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(), protectionInfo(), runs, workflowRunsInfo());
  assert.ok(result.blockers.includes('required_ci_check_not_successful_on_exact_head'));
  assert.equal(result.requiredCheckRunId, 124);
  assert.equal(result.requiredCheckRunConclusion, 'failure');
  assert.equal(result.deploymentAuthorized, false);
});

test('a successful check from another SHA, another app, or a pending run cannot satisfy release posture', () => {
  const cases = [
    run => { run.head_sha = 'b'.repeat(40); },
    run => { run.app.slug = 'untrusted-check-app'; },
    run => { run.status = 'in_progress'; run.conclusion = null; }
  ];
  for (const mutate of cases) {
    const runs = checkRunsInfo();
    mutate(runs.check_runs[0]);
    const result = inspectPosture(EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(), protectionInfo(), runs, workflowRunsInfo());
    assert.ok(result.blockers.includes('required_ci_check_not_successful_on_exact_head'));
    assert.equal(result.deploymentAuthorized, false);
  }
});

test('missing or truncated check-run observations fail closed', () => {
  const missing = inspectPosture(EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(), protectionInfo(), null, workflowRunsInfo());
  assert.ok(missing.blockers.includes('required_ci_check_observation_unavailable'));
  const truncated = inspectPosture(EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(), protectionInfo(), {
    total_count: 101,
    check_runs: checkRunsInfo().check_runs
  }, workflowRunsInfo());
  assert.ok(truncated.blockers.includes('required_ci_check_observation_incomplete_or_truncated'));
  const missingWorkflow = inspectPosture(EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(), protectionInfo(), checkRunsInfo(), null);
  assert.ok(missingWorkflow.blockers.includes('required_workflow_run_observation_unavailable'));
  const truncatedWorkflow = inspectPosture(EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(), protectionInfo(), checkRunsInfo(), {
    total_count: 101,
    workflow_runs: workflowRunsInfo().workflow_runs
  });
  assert.ok(truncatedWorkflow.blockers.includes('required_workflow_run_observation_incomplete_or_truncated'));
});

test('check-run API permission failures fail closed instead of trusting branch-rule configuration alone', async () => {
  const result = await auditRepositoryPosture({
    fetchImpl: async url => {
      if (url === 'https://api.github.com/repos/' + EXPECTED_REPOSITORY) return { ok: true, json: async () => repoInfo() };
      if (url.endsWith('/protection')) return { ok: true, json: async () => protectionInfo() };
      if (url.includes('/branches/')) return { ok: true, json: async () => branchInfo() };
      if (url.includes('/check-runs?')) return { ok: false, status: 403, json: async () => ({ message: 'PRIVATE_CHECK_DETAILS' }) };
      if (url.includes('/actions/runs?head_sha=')) return { ok: true, json: async () => workflowRunsInfo() };
      throw new Error('unexpected_url');
    }
  });
  assert.equal(result.status, 'NOT_VERIFIED');
  assert.deepEqual(result.blockers, ['github_api_forbidden_or_permission_insufficient']);
  assert.equal(JSON.stringify(result).includes('PRIVATE_CHECK_DETAILS'), false);
  assert.equal(result.deploymentAuthorized, false);
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


test('latest matching workflow run uses timestamp then run-id ordering; a tied newer failure wins', () => {
  const runs = workflowRunsInfo();
  runs.total_count = 2;
  runs.workflow_runs.push({
    ...runs.workflow_runs[0],
    id: 457,
    status: 'completed',
    conclusion: 'failure',
    run_started_at: '2026-11-23T10:00:00Z',
    created_at: '2026-11-23T10:00:00Z'
  });
  const result = inspectPosture(EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(), protectionInfo(), checkRunsInfo(), runs);
  assert.equal(result.requiredWorkflowRunId, 457);
  assert.ok(result.blockers.includes('required_workflow_run_not_successful_on_exact_head'));
  assert.equal(result.deploymentAuthorized, false);
});

test('a matching workflow run with an invalid timestamp or check-suite id cannot be ignored', () => {
  for (const mutate of [
    run => { run.run_started_at = 'not-a-timestamp'; run.created_at = 'also-invalid'; },
    run => { run.check_suite_id = 0; }
  ]) {
    const runs = workflowRunsInfo();
    runs.total_count = 2;
    const invalid = { ...runs.workflow_runs[0], id: 457, run_started_at: '2026-11-23T10:01:00Z', created_at: '2026-11-23T10:01:00Z' };
    mutate(invalid);
    runs.workflow_runs.push(invalid);
    const result = inspectPosture(EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(), protectionInfo(), checkRunsInfo(), runs);
    assert.ok(result.blockers.includes('required_workflow_run_observation_invalid'));
    assert.equal(result.deploymentAuthorized, false);
  }
});

test('latest matching check run uses timestamp then check-run id ordering', () => {
  const runs = checkRunsInfo();
  runs.total_count = 2;
  runs.check_runs.push({
    ...runs.check_runs[0],
    id: 124,
    status: 'completed',
    conclusion: 'failure',
    started_at: '2026-11-23T10:00:00Z',
    completed_at: '2026-11-23T10:00:20Z'
  });
  const result = inspectPosture(EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(), protectionInfo(), runs, workflowRunsInfo());
  assert.equal(result.requiredCheckRunId, 124);
  assert.ok(result.blockers.includes('required_ci_check_not_successful_on_exact_head'));
  assert.equal(result.deploymentAuthorized, false);
});

test('a malformed matching completed check run blocks release instead of falling back to an older green run', () => {
  const runs = checkRunsInfo();
  runs.total_count = 2;
  runs.check_runs.push({
    ...runs.check_runs[0],
    id: 124,
    status: 'completed',
    conclusion: 'success',
    started_at: 'not-a-timestamp',
    completed_at: 'also-invalid'
  });
  const result = inspectPosture(EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(), protectionInfo(), runs, workflowRunsInfo());
  assert.ok(result.blockers.includes('required_ci_check_observation_invalid'));
  assert.equal(result.deploymentAuthorized, false);
});


test('labels the active exact-head push workflow as self-observation pending', () => {
  const runs = workflowRunsInfo();
  runs.workflow_runs[0].status = 'in_progress';
  runs.workflow_runs[0].conclusion = null;
  const result = inspectPosture(
    EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(),
    protectionInfo(), checkRunsInfo(), runs, 456
  );
  assert.equal(result.requiredWorkflowRunId, 456);
  assert.equal(result.requiredWorkflowRunIsCurrentExecution, true);
  assert.equal(result.requiredWorkflowRunIsPendingSelfObservation, true);
  assert.ok(result.blockers.includes('required_workflow_run_self_observation_pending'));
  assert.ok(!result.blockers.includes('required_workflow_run_not_successful_on_exact_head'));
  assert.equal(result.deploymentAuthorized, false);
});

test('does not label a completed failed current workflow as pending self-observation', () => {
  const runs = workflowRunsInfo();
  runs.workflow_runs[0].conclusion = 'failure';
  const result = inspectPosture(
    EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(),
    protectionInfo(), checkRunsInfo(), runs, 456
  );
  assert.equal(result.requiredWorkflowRunIsCurrentExecution, true);
  assert.equal(result.requiredWorkflowRunIsPendingSelfObservation, false);
  assert.ok(result.blockers.includes('required_workflow_run_not_successful_on_exact_head'));
  assert.ok(!result.blockers.includes('required_workflow_run_self_observation_pending'));
});

test('does not misclassify another in-progress exact-head run as the current execution', () => {
  const runs = workflowRunsInfo();
  runs.workflow_runs[0].status = 'in_progress';
  runs.workflow_runs[0].conclusion = null;
  const result = inspectPosture(
    EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(),
    protectionInfo(), checkRunsInfo(), runs, 455
  );
  assert.equal(result.requiredWorkflowRunIsCurrentExecution, false);
  assert.equal(result.requiredWorkflowRunIsPendingSelfObservation, false);
  assert.ok(result.blockers.includes('required_workflow_run_not_successful_on_exact_head'));
  assert.ok(!result.blockers.includes('required_workflow_run_self_observation_pending'));
});

test('a separate audit invocation can rely on the completed push run for the same head', () => {
  const result = inspectPosture(
    EXPECTED_REPOSITORY, EXPECTED_BRANCH, repoInfo(), branchInfo(),
    protectionInfo(), checkRunsInfo(), workflowRunsInfo(), 789
  );
  assert.equal(result.requiredWorkflowRunId, 456);
  assert.equal(result.requiredWorkflowRunIsCurrentExecution, false);
  assert.equal(result.requiredWorkflowRunIsPendingSelfObservation, false);
  assert.equal(result.status, 'POSTURE_VERIFIED');
  assert.deepEqual(result.blockers, []);
});
