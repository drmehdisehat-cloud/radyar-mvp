'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EXPECTED_REPOSITORY,
  EXPECTED_BRANCH,
  REQUIRED_WORKFLOW_ID,
  REQUIRED_WORKFLOW_PATH,
  REQUIRED_JOB,
  waitForRequiredCi
} = require('../scripts/wait-for-experimental-ci.cjs');

const SHA = 'b'.repeat(40);
function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}
function run(overrides = {}) {
  return {
    id: 12345,
    workflow_id: REQUIRED_WORKFLOW_ID,
    path: REQUIRED_WORKFLOW_PATH,
    event: 'push',
    head_branch: EXPECTED_BRANCH,
    head_sha: SHA,
    status: 'completed',
    conclusion: 'success',
    run_started_at: '2026-11-24T10:00:00Z',
    ...overrides
  };
}
function job(overrides = {}) {
  return {
    id: 67890,
    run_id: 12345,
    name: REQUIRED_JOB,
    head_sha: SHA,
    status: 'completed',
    conclusion: 'success',
    ...overrides
  };
}
function apiFor(runPayload, jobsPayload = { total_count: 1, jobs: [job()] }) {
  return async url => {
    if (url.includes('/actions/runs?')) return response(runPayload);
    if (url.includes('/actions/runs/12345/jobs?')) return response(jobsPayload);
    throw new Error('unexpected test URL');
  };
}

test('accepts only the exact push workflow and required job after completion', async () => {
  const result = await waitForRequiredCi({
    repository: EXPECTED_REPOSITORY,
    branch: EXPECTED_BRANCH,
    sha: SHA,
    token: 'synthetic-token',
    fetchImpl: apiFor({ total_count: 1, workflow_runs: [run()] }),
    maxAttempts: 1,
    intervalMs: 0
  });
  assert.equal(result.status, 'REQUIRED_CHECK_VERIFIED');
  assert.equal(result.workflow_run_id, 12345);
  assert.equal(result.required_job_id, 67890);
  assert.equal(result.deployment_authorized, false);
});

test('accepts the exact required job after success while the informational audit job is still running', async () => {
  const result = await waitForRequiredCi({
    repository: EXPECTED_REPOSITORY,
    branch: EXPECTED_BRANCH,
    sha: SHA,
    token: 'synthetic-token',
    fetchImpl: apiFor({ total_count: 1, workflow_runs: [run({ status: 'in_progress', conclusion: null })] }),
    maxAttempts: 1,
    intervalMs: 0
  });
  assert.equal(result.status, 'REQUIRED_CHECK_VERIFIED');
  assert.equal(result.workflow_status, 'in_progress');
  assert.equal(result.workflow_conclusion, null);
  assert.equal(result.deployment_authorized, false);
});

test('waits while the required job itself is in progress, then accepts its exact-head success', async () => {
  const jobPayloads = [
    { total_count: 1, jobs: [job({ status: 'in_progress', conclusion: null })] },
    { total_count: 1, jobs: [job()] }
  ];
  let jobsRead = 0;
  let sleeps = 0;
  const result = await waitForRequiredCi({
    repository: EXPECTED_REPOSITORY,
    branch: EXPECTED_BRANCH,
    sha: SHA,
    token: 'synthetic-token',
    fetchImpl: async url => {
      if (url.includes('/actions/runs?')) return response({ total_count: 1, workflow_runs: [run({ status: 'in_progress', conclusion: null })] });
      jobsRead += 1;
      return response(jobPayloads.shift());
    },
    sleepImpl: async () => { sleeps += 1; },
    maxAttempts: 2,
    intervalMs: 0
  });
  assert.equal(jobsRead, 2);
  assert.equal(sleeps, 1);
  assert.equal(result.status, 'REQUIRED_CHECK_VERIFIED');
});

test('does not accept a stale successful run from a different commit', async () => {
  await assert.rejects(() => waitForRequiredCi({
    repository: EXPECTED_REPOSITORY,
    branch: EXPECTED_BRANCH,
    sha: SHA,
    token: 'synthetic-token',
    fetchImpl: apiFor({ total_count: 1, workflow_runs: [run({ head_sha: 'a'.repeat(40) })] }),
    sleepImpl: async () => {},
    maxAttempts: 2,
    intervalMs: 0
  }), /required_ci_did_not_complete_within_wait_window/);
});

test('ignores successful PR runs and other workflows on the same commit', async () => {
  await assert.rejects(() => waitForRequiredCi({
    repository: EXPECTED_REPOSITORY,
    branch: EXPECTED_BRANCH,
    sha: SHA,
    token: 'synthetic-token',
    fetchImpl: apiFor({
      total_count: 2,
      workflow_runs: [
        run({ event: 'pull_request' }),
        run({ workflow_id: REQUIRED_WORKFLOW_ID + 1 })
      ]
    }),
    sleepImpl: async () => {},
    maxAttempts: 1,
    intervalMs: 0
  }), /required_ci_did_not_complete_within_wait_window/);
});

test('fails closed when the latest exact-head workflow concludes failure', async () => {
  await assert.rejects(() => waitForRequiredCi({
    repository: EXPECTED_REPOSITORY,
    branch: EXPECTED_BRANCH,
    sha: SHA,
    token: 'synthetic-token',
    fetchImpl: apiFor({ total_count: 1, workflow_runs: [run({ conclusion: 'failure' })] }),
    maxAttempts: 1,
    intervalMs: 0
  }), /required_workflow_not_successful_on_exact_head/);
});

test('fails closed when the required job is absent, failed or attached to another SHA', async t => {
  const cases = [
    { total_count: 0, jobs: [] },
    { total_count: 1, jobs: [job({ conclusion: 'failure' })] },
    { total_count: 1, jobs: [job({ head_sha: 'c'.repeat(40) })] }
  ];
  for (const jobsPayload of cases) {
    await t.test(JSON.stringify(jobsPayload), async () => {
      await assert.rejects(() => waitForRequiredCi({
        repository: EXPECTED_REPOSITORY,
        branch: EXPECTED_BRANCH,
        sha: SHA,
        token: 'synthetic-token',
        fetchImpl: apiFor({ total_count: 1, workflow_runs: [run()] }, jobsPayload),
        maxAttempts: 1,
        intervalMs: 0
      }), /required_ci_job_not_successful_on_exact_head/);
    });
  }
});

test('rejects truncated job observations and invalid repository or branch inputs', async () => {
  await assert.rejects(() => waitForRequiredCi({
    repository: EXPECTED_REPOSITORY,
    branch: EXPECTED_BRANCH,
    sha: SHA,
    token: 'synthetic-token',
    fetchImpl: apiFor({ total_count: 1, workflow_runs: [run()] }, { total_count: 2, jobs: [job()] }),
    maxAttempts: 1,
    intervalMs: 0
  }), /required_workflow_job_observation_incomplete/);
  await assert.rejects(() => waitForRequiredCi({
    repository: 'someone/else', branch: EXPECTED_BRANCH, sha: SHA, token: 'synthetic-token',
    fetchImpl: apiFor({ total_count: 1, workflow_runs: [run()] }), maxAttempts: 1
  }), /unexpected_repository_or_branch/);
});
