'use strict';

// Read-only live GitHub posture audit for the Dadyar release branch.
// It never changes repository settings, refs, files, or deployments.
const API = 'https://api.github.com';
const EXPECTED_REPOSITORY = 'drmehdisehat-cloud/radyar-mvp';
const EXPECTED_BRANCH = 'dadyar/ai-chat-private-20261101';
const REQUIRED_CHECK = 'Dadyar stage-0 experimental CI / verify-existing-frontend';
const REQUIRED_CHECK_RUN = 'verify-existing-frontend';

async function getJson(url, fetchImpl, token) {
  const headers = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'dadyar-read-only-release-posture-audit'
  };
  if (token) headers.authorization = 'Bearer ' + token;
  const response = await fetchImpl(url, { method: 'GET', headers, redirect: 'error' });
  if (!response || response.ok !== true) {
    const status = response && Number.isInteger(response.status) ? response.status : 0;
    throw new Error('github_api_read_failed_' + status);
  }
  return response.json();
}

function classifyGitHubReadFailure(error) {
  const message = error && typeof error.message === 'string' ? error.message : '';
  const match = /^github_api_read_failed_(\d{3})$/.exec(message);
  if (!match) return 'github_api_network_or_transport_failure';
  const status = Number(match[1]);
  if (status === 401) return 'github_api_authentication_failed';
  if (status === 403) return 'github_api_forbidden_or_permission_insufficient';
  if (status === 404) return 'github_api_resource_not_found_or_hidden';
  if (status === 429) return 'github_api_rate_limited';
  if (status >= 500) return 'github_api_server_error';
  return 'github_api_http_error_' + status;
}

function inspectPosture(repository, branch, repoInfo, branchInfo, protectionInfo, checkRunsInfo) {
  const blockers = [];
  if (repoInfo.full_name !== repository) blockers.push('repository_identity_mismatch');
  if (typeof repoInfo.private !== 'boolean') blockers.push('repository_visibility_unavailable');
  else if (repoInfo.private !== true) blockers.push('repository_must_be_private');
  if (branchInfo.name !== branch) blockers.push('release_branch_identity_mismatch');
  if (typeof branchInfo.protected !== 'boolean') blockers.push('release_branch_protection_status_unavailable');
  else if (branchInfo.protected !== true) blockers.push('release_branch_protection_disabled');

  if (branchInfo.protected === true && !protectionInfo) {
    blockers.push('branch_protection_details_unavailable');
  } else if (protectionInfo) {
    const checks = protectionInfo.required_status_checks;
    const contexts = checks && Array.isArray(checks.contexts) ? checks.contexts : [];
    if (!checks || !Array.isArray(checks.contexts) || !contexts.includes(REQUIRED_CHECK)) {
      blockers.push('required_dadyar_ci_check_not_enforced');
    }
    // The check must be strict: a branch that is allowed to lag behind its base
    // can otherwise satisfy a stale success from a different merge base.
    if (!checks || checks.strict !== true) {
      blockers.push('required_dadyar_ci_check_not_strict');
    }

    const reviews = protectionInfo.required_pull_request_reviews;
    if (!reviews || !Number.isSafeInteger(reviews.required_approving_review_count) ||
        reviews.required_approving_review_count < 1 || reviews.dismiss_stale_reviews !== true) {
      blockers.push('independent_pull_request_review_policy_missing');
    }

    if (!protectionInfo.enforce_admins || protectionInfo.enforce_admins.enabled !== true) {
      blockers.push('branch_protection_not_enforced_for_admins');
    }
    // Protect the release ref against destructive bypasses as well as stale CI.
    if (!protectionInfo.allow_force_pushes || protectionInfo.allow_force_pushes.enabled !== false) {
      blockers.push('force_pushes_must_be_disabled');
    }
    if (!protectionInfo.allow_deletions || protectionInfo.allow_deletions.enabled !== false) {
      blockers.push('branch_deletion_must_be_disabled');
    }
    if (!protectionInfo.required_conversation_resolution ||
        protectionInfo.required_conversation_resolution.enabled !== true) {
      blockers.push('required_review_conversation_resolution_missing');
    }
  }

  const headSha = branchInfo.commit && typeof branchInfo.commit.sha === 'string' &&
    /^[a-f0-9]{40}$/i.test(branchInfo.commit.sha)
    ? branchInfo.commit.sha.toLowerCase() : null;
  let requiredCheckRun = null;
  if (!headSha) {
    blockers.push('release_branch_head_sha_unavailable');
  } else if (!checkRunsInfo || !Array.isArray(checkRunsInfo.check_runs)) {
    blockers.push('required_ci_check_observation_unavailable');
  } else if (Number.isSafeInteger(checkRunsInfo.total_count) &&
      checkRunsInfo.total_count > checkRunsInfo.check_runs.length) {
    blockers.push('required_ci_check_observation_truncated');
  } else {
    const candidates = checkRunsInfo.check_runs.filter(run =>
      run && run.name === REQUIRED_CHECK_RUN &&
      typeof run.head_sha === 'string' &&
      run.head_sha.toLowerCase() === headSha &&
      run.app && run.app.slug === 'github-actions'
    );
    for (const candidate of candidates) {
      const candidateStartedAt = typeof candidate.started_at === 'string' ? candidate.started_at : '';
      const currentStartedAt = requiredCheckRun && typeof requiredCheckRun.started_at === 'string'
        ? requiredCheckRun.started_at : '';
      if (!requiredCheckRun || candidateStartedAt > currentStartedAt) requiredCheckRun = candidate;
    }
    const startedAt = requiredCheckRun && Date.parse(requiredCheckRun.started_at);
    const completedAt = requiredCheckRun && Date.parse(requiredCheckRun.completed_at);
    if (!requiredCheckRun ||
        !Number.isSafeInteger(requiredCheckRun.id) || requiredCheckRun.id < 1 ||
        requiredCheckRun.status !== 'completed' || requiredCheckRun.conclusion !== 'success' ||
        !Number.isFinite(startedAt) || !Number.isFinite(completedAt) || completedAt < startedAt) {
      blockers.push('required_ci_check_not_successful_on_exact_head');
    }
  }

  return Object.freeze({
    schema: 'dadyar-github-release-posture-observation-v1',
    observedAt: new Date().toISOString(),
    status: blockers.length ? 'NOT_READY' : 'POSTURE_VERIFIED',
    repository,
    visibility: repoInfo.private === true ? 'private' : repoInfo.private === false ? 'public' : 'unknown',
    branch,
    branchProtected: typeof branchInfo.protected === 'boolean' ? branchInfo.protected : null,
    headSha,
    requiredCheckRunId: requiredCheckRun && Number.isSafeInteger(requiredCheckRun.id) ? requiredCheckRun.id : null,
    requiredCheckRunHeadSha: requiredCheckRun && typeof requiredCheckRun.head_sha === 'string'
      ? requiredCheckRun.head_sha.toLowerCase() : null,
    requiredCheckRunConclusion: requiredCheckRun && typeof requiredCheckRun.conclusion === 'string'
      ? requiredCheckRun.conclusion : null,
    blockers: Object.freeze(blockers),
    deploymentAuthorized: false
  });
}

async function auditRepositoryPosture({
  repository = EXPECTED_REPOSITORY,
  branch = EXPECTED_BRANCH,
  token,
  fetchImpl = globalThis.fetch
} = {}) {
  if (repository !== EXPECTED_REPOSITORY || branch !== EXPECTED_BRANCH) {
    return Object.freeze({
      schema: 'dadyar-github-release-posture-observation-v1',
      observedAt: new Date().toISOString(),
      status: 'NOT_VERIFIED',
      repository: EXPECTED_REPOSITORY,
      branch: EXPECTED_BRANCH,
      blockers: Object.freeze(['unexpected_repository_or_release_branch']),
      deploymentAuthorized: false
    });
  }
  if (typeof fetchImpl !== 'function') {
    return Object.freeze({
      schema: 'dadyar-github-release-posture-observation-v1',
      observedAt: new Date().toISOString(),
      status: 'NOT_VERIFIED',
      repository,
      branch,
      blockers: Object.freeze(['fetch_unavailable']),
      deploymentAuthorized: false
    });
  }
  try {
    const encodedBranch = encodeURIComponent(branch);
    const [repoInfo, branchInfo] = await Promise.all([
      getJson(API + '/repos/' + repository, fetchImpl, token),
      getJson(API + '/repos/' + repository + '/branches/' + encodedBranch, fetchImpl, token)
    ]);
    const headSha = branchInfo.commit && typeof branchInfo.commit.sha === 'string' &&
      /^[a-f0-9]{40}$/i.test(branchInfo.commit.sha) ? branchInfo.commit.sha : null;
    const [protectionInfo, checkRunsInfo] = await Promise.all([
      branchInfo.protected === true
        ? getJson(API + '/repos/' + repository + '/branches/' + encodedBranch + '/protection', fetchImpl, token)
        : Promise.resolve(null),
      headSha
        ? getJson(API + '/repos/' + repository + '/commits/' + encodeURIComponent(headSha) + '/check-runs?per_page=100', fetchImpl, token)
        : Promise.resolve(null)
    ]);
    return inspectPosture(repository, branch, repoInfo, branchInfo, protectionInfo, checkRunsInfo);
  } catch (error) {
    return Object.freeze({
      schema: 'dadyar-github-release-posture-observation-v1',
      observedAt: new Date().toISOString(),
      status: 'NOT_VERIFIED',
      repository,
      branch,
      blockers: Object.freeze([classifyGitHubReadFailure(error)]),
      deploymentAuthorized: false
    });
  }
}

async function main() {
  const result = await auditRepositoryPosture({
    repository: process.env.GITHUB_REPOSITORY || EXPECTED_REPOSITORY,
    branch: EXPECTED_BRANCH,
    token: process.env.GITHUB_TOKEN
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (process.argv.includes('--enforce') && result.status !== 'POSTURE_VERIFIED') {
    process.exitCode = 1;
  }
  return result;
}

if (require.main === module) {
  main().catch(() => {
    process.stdout.write(JSON.stringify({
      schema: 'dadyar-github-release-posture-observation-v1',
      status: 'NOT_VERIFIED',
      blockers: ['audit_execution_failed'],
      deploymentAuthorized: false
    }, null, 2) + '\n');
    process.exitCode = 1;
  });
}

module.exports = {
  EXPECTED_REPOSITORY,
  EXPECTED_BRANCH,
  REQUIRED_CHECK,
  REQUIRED_CHECK_RUN,
  auditRepositoryPosture,
  classifyGitHubReadFailure,
  inspectPosture
};
