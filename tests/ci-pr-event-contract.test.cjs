'use strict';
// Regression test for GitHub Actions job guard; synthetic event metadata only.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/ci.yml'), 'utf8');
const match = workflow.match(/^\s*if:\s*>-\s*\n([\s\S]*?)\n\s*runs-on:/m);
const guard = match?.[1].trim().replace(/\s+/g, ' ');
function shouldRun(event_name, ref, base_ref) {
  assert.ok(guard, 'CI job guard must exist');
  return vm.runInNewContext(guard, { github: { event_name, ref, base_ref } }, { timeout: 500 });
}
test('CI job guard runs for review PRs but not main pushes or unrelated events', () => {
  const cases = [
    ['push', 'refs/heads/dadyar/mvp-sync-028', '', true],
    ['push', 'refs/heads/main', '', false],
    ['pull_request', 'refs/pull/12/merge', 'dadyar/mvp-sync-028', true],
    ['pull_request', 'refs/pull/13/merge', 'main', true],
    ['pull_request', 'refs/pull/14/merge', 'unrelated', false],
    ['workflow_dispatch', 'refs/heads/dadyar/mvp-sync-028', '', false],
    ['pull_request_target', 'refs/heads/main', 'main', false],
  ];
  for (const [event, ref, base, expected] of cases) {
    assert.equal(shouldRun(event, ref, base), expected, `${event} ${ref} ${base}`);
  }
});
