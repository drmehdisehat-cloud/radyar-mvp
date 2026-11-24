'use strict';

// Wait for the exact branch push's required CI workflow to finish before the
// separate public-review-artifact workflow audits repository posture.
// This prevents a race where the required CI run is still in_progress even
// though its required job has already passed. This script never deploys.

const API = 'https://api.github.com';
const EXPECTED_REPOSITORY = 'drmehdisehat-cloud/radyar-mvp';
const EXPECTED_BRANCH = 'dadyar/ai-chat-private-20261101';
const REQUIRED_WORKFLOW_ID = 393734552;
const REQUIRED_WORKFLOW_PATH = '.github/workflows/ci.yml';
const REQUIRED_JOB = 'verify-existing-frontend';

async function getJson(url, fetchImpl, token) {
  const response = await fetchImpl(url, {
    method: 'GET',
    redirect: 'error',
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'dadyar-exact-head-ci-waiter',
      authorization: 'Bearer ' + token
    }
  });
  if (!response || response.ok !== true) {
    const status = response && Number.isInteger(response.status) ? response.status : 0;
    throw new Error('github_api_read_failed_' + status);
  }
  return response.json();
}

function latestExactRun(payload, branch, sha) {
  if (!payload || !Array.isArray(payload.workflow_runs)) {
    throw new Error('workflow_run_observation_invalid');
  }
  const candidates = payload.workflow_runs.filter(run =>
    run && run.workflow_id === REQUIRED_WORKFLOW_ID &&
    run.path === REQUIRED_WORKFLOW_PATH &&
    run.event === 'push' &&
    run.head_branch === branch &&
    typeof run.head_sha === 'string' && run.head_sha.toLowerCase() === sha
  );
  if (!candidates.length) return null;
  for (const run of candidates) {
    const started = Date.parse(run.run_started_at || run.created_at || '');
    if (!Number.isSafeInteger(run.id) || run.id < 1 || !Number.isFinite(started)) {
      throw new Error('matching_workflow_run_metadata_invalid');
    }
  }
  candidates.sort((a, b) => {
    const aTime = Date.parse(a.run_started_at || a.created_at);
    const bTime = Date.parse(b.run_started_at || b.created_at);
    return bTime - aTime || b.id - a.id;
  });
  return candidates[0];
}

async function waitForRequiredCi({
  repository = EXPECTED_REPOSITORY,
  branch = EXPECTED_BRANCH,
  sha,
  token,
  fetchImpl = globalThis.fetch,
  sleepImpl = ms => new Promise(resolve => setTimeout(resolve, ms)),
  maxAttempts = 90,
  intervalMs = 5000
} = {}) {
  if (repository !== EXPECTED_REPOSITORY || branch !== EXPECTED_BRANCH) {
    throw new Error('unexpected_repository_or_branch');
  }
  if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/i.test(sha)) {
    throw new Error('expected_full_commit_sha_required');
  }
  const normalizedSha = sha.toLowerCase();
  if (typeof token !== 'string' || token.length < 1) throw new Error('github_token_required');
  if (typeof fetchImpl !== 'function') throw new Error('fetch_unavailable');
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 120 ||
      !Number.isSafeInteger(intervalMs) || intervalMs < 0 || intervalMs > 30000) {
    throw new Error('wait_bounds_invalid');
  }

  const runsUrl = API + '/repos/' + repository + '/actions/runs?branch=' +
    encodeURIComponent(branch) + '&event=push&per_page=100';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const payload = await getJson(runsUrl, fetchImpl, token);
    const run = latestExactRun(payload, branch, normalizedSha);
    if (run && run.status === 'completed') {
      if (run.conclusion !== 'success') {
        throw new Error('required_workflow_not_successful_on_exact_head');
      }
      const jobsPayload = await getJson(
        API + '/repos/' + repository + '/actions/runs/' + run.id + '/jobs?per_page=100',
        fetchImpl,
        token
      );
      if (!jobsPayload || !Array.isArray(jobsPayload.jobs) ||
          !Number.isSafeInteger(jobsPayload.total_count) ||
          jobsPayload.total_count !== jobsPayload.jobs.length) {
        throw new Error('required_workflow_job_observation_incomplete');
      }
      const requiredJob = jobsPayload.jobs.find(job => job && job.name === REQUIRED_JOB);
      if (!requiredJob || requiredJob.status !== 'completed' || requiredJob.conclusion !== 'success' ||
          typeof requiredJob.head_sha !== 'string' || requiredJob.head_sha.toLowerCase() !== normalizedSha) {
        throw new Error('required_ci_job_not_successful_on_exact_head');
      }
      return Object.freeze({
        status: 'VERIFIED',
        repository,
        branch,
        head_sha: normalizedSha,
        workflow_id: REQUIRED_WORKFLOW_ID,
        workflow_run_id: run.id,
        workflow_conclusion: run.conclusion,
        required_job: REQUIRED_JOB,
        required_job_id: requiredJob.id,
        deployment_authorized: false
      });
    }
    if (run && !['queued', 'in_progress', 'waiting', 'requested', 'pending'].includes(run.status)) {
      throw new Error('required_workflow_status_unrecognized');
    }
    if (attempt < maxAttempts) await sleepImpl(intervalMs);
  }
  throw new Error('required_ci_did_not_complete_within_wait_window');
}

async function main(env = process.env) {
  try {
    if (env.GITHUB_REF !== 'refs/heads/' + EXPECTED_BRANCH) {
      throw new Error('unexpected_workflow_ref');
    }
    const result = await waitForRequiredCi({
      repository: env.GITHUB_REPOSITORY,
      branch: EXPECTED_BRANCH,
      sha: env.GITHUB_SHA,
      token: env.GITHUB_TOKEN
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 0;
  } catch (error) {
    process.stdout.write(JSON.stringify({
      status: 'NOT_VERIFIED',
      error: String(error && error.message || 'verification_failed').slice(0, 160),
      deployment_authorized: false
    }, null, 2) + '\n');
    return 1;
  }
}

if (require.main === module) {
  main().then(code => { process.exitCode = code; }).catch(() => { process.exitCode = 1; });
}

module.exports = {
  EXPECTED_REPOSITORY,
  EXPECTED_BRANCH,
  REQUIRED_WORKFLOW_ID,
  REQUIRED_WORKFLOW_PATH,
  REQUIRED_JOB,
  latestExactRun,
  waitForRequiredCi,
  main
};
