'use strict';
// Regression guard for incomplete HTML bootstrap before public preview.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const script of ['flows.js', 'app.js', 'export.js']) {
  assert.ok(fs.existsSync(path.join(root, script)), `Missing asset: ${script}`);
  assert.ok(html.includes(`<script src="${script}"></script>`), `Missing HTML script: ${script}`);
}
for (const id of ['start', 'next', 'reset', 'editAnswers']) {
  assert.ok(html.includes(`id="${id}"`), `Missing UI control: ${id}`);
}
console.log('PASS: Dadyar frontend bootstrap assets and controls');
