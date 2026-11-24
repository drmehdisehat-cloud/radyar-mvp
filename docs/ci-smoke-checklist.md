# Experimental CI smoke gate

Scope: `dadyar/mvp-sync-028` only. Do not deploy or modify `main`.

Required commands for the current remote tree:

```sh
node --check app.js
node --check flows.js
node --check export.js
node tests/topic-role-contract.test.cjs
```

Run GitHub Actions after installing the read-only workflow and inspect the actual run before moving local code. No client data or credentials belong in this repository.
