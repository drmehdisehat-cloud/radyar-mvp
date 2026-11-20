# CI-only verification branch

This one-file review branch exists only to verify that pull requests targeting
`dadyar/ai-chat-private-20261101` execute the repository's read-only stage-0 CI.

- No application code is changed on this branch.
- No production host, DNS, database, API key, or repository secret is used.
- The base branch contains the offline preview privacy-contract test.
- Do not merge this marker file; close this review PR after recording the CI result.
