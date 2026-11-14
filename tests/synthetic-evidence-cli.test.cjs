'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const cli = path.resolve(__dirname, '../scripts/synthetic-evidence-cli.cjs');
function run(input) {
  return spawnSync(process.execPath, [cli], { input, encoding: 'utf8', timeout: 3000, maxBuffer: 65536 });
}
test('CLI returns offline synthetic opposing-evidence report for cheque', () => {
  const result = run(JSON.stringify({topic:'چک',role:'وکیل',synthetic:true,evidence:[
    {stance:'موافق',description:'تصویر فرضی چک'},
    {stance:'مخالف',description:'دفاع فرضی پرداخت'}]}));
  assert.equal(result.status, 0);
  const brief = JSON.parse(result.stdout);
  assert.equal(brief.status, 'SYNTHETIC_ONLY');
  assert.equal(brief.forClaim.length, 1);
  assert.equal(brief.againstClaim.length, 1);
  assert.deepEqual(brief.legalSources, []);
});
test('CLI rejects non-synthetic input without echoing it', () => {
  const result = run(JSON.stringify({topic:'چک',role:'وکیل',synthetic:false,evidence:[],secret:'DO_NOT_ECHO'}));
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'invalid_synthetic_input\n');
});
test('CLI rejects excessive input before JSON parsing', () => {
  const result = run('x'.repeat(17000));
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'input_too_large\n');
});
