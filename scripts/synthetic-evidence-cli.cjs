'use strict';
// Local-only synthetic evidence intake. No network, storage or legal authority.
// Usage: printf '%s' '{"topic":"چک","role":"وکیل","synthetic":true,"evidence":[]}' | node scripts/synthetic-evidence-cli.cjs
const { createSyntheticEvidenceBrief } = require('../backend/synthetic-evidence-brief');
const MAX_BYTES = 16384;
let bytes = 0;
let chunks = [];
process.stdin.on('data', chunk => {
  bytes += chunk.length;
  if (bytes > MAX_BYTES) {
    process.stderr.write('input_too_large\n');
    process.exitCode = 2;
    process.stdin.destroy();
    return;
  }
  chunks.push(chunk);
});
process.stdin.on('end', () => {
  if (process.exitCode) return;
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const result = createSyntheticEvidenceBrief(input);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    // Do not echo user input or error details into logs.
    process.stderr.write('invalid_synthetic_input\n');
    process.exitCode = 2;
  }
});
