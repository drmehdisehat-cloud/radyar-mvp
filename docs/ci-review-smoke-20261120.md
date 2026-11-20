# CI-only verification branch

This one-file review branch exists only to verify that pull requests targeting
`dadyar/ai-chat-private-20261101` execute the repository's read-only stage-0 CI.

- No application code is changed on this branch.
- No production host, DNS, database, API key, or repository secret is used.
- The base branch contains the offline preview privacy-contract test.
- Do not merge this marker file; close this review PR after recording the CI result.

The base branch's CI allow-list tests were updated to include the branch as a pull-request target; this follow-up commit requests a fresh run against that corrected base.
