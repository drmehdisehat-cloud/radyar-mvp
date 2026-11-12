'use strict';
// Local, read-only release preflight. This script never deploys or writes evidence.
const fs = require('node:fs');
const path = require('node:path');
const { decidePreviewRelease } = require('./decide-preview-release.cjs');
const { readStableRegularFile } = require('./stable-file-integrity.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const MAX_EVIDENCE_BYTES = 64 * 1024;
const USAGE = [
  'Usage:',
  '  node scripts/preview-release-preflight.cjs --restore-evidence ABSOLUTE_JSON_PATH',
  '    --destination-evidence ABSOLUTE_JSON_PATH',
  '    --isolated-restore-verified --mobile-browser-verified',
  '    --zero-api-requests-verified --human-review-verified',
  '',
  'Evidence files must be outside the Git checkout. This is a read-only schema/attestation check;',
  'it never deploys; it does not authenticate reviewers, independently prove a restore, or publish files.'
].join('\n');

const FLAG_NAMES = new Set([
  '--isolated-restore-verified',
  '--mobile-browser-verified',
  '--zero-api-requests-verified',
  '--human-review-verified',
  '--authenticated-human-review-attested'
]);

function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function assertNoSymlinkComponents(target) {
  let current = path.resolve(target);
  while (true) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error('evidence_path_contains_symlink');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function readEvidence(flag, file) {
  if (!path.isAbsolute(file)) throw new Error(flag + '_must_be_absolute');
  assertNoSymlinkComponents(file);
  const realPath = fs.realpathSync(file);
  if (isInside(REPO_ROOT, realPath)) throw new Error(flag + '_must_be_outside_git_checkout');
  // Read evidence through a no-follow descriptor, reject hard-link aliases,
  // enforce the size budget before allocating bytes, and verify the file did
  // not change while being read.
  const stable = readStableRegularFile(realPath, flag, {
    includeBytes: true,
    maxBytes: MAX_EVIDENCE_BYTES
  });
  let value;
  try {
    value = JSON.parse(stable.bytes.toString('utf8'));
  } catch {
    throw new Error(flag + '_is_not_valid_json');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(flag + '_must_contain_a_json_object');
  }
  return value;
}

function parseArgs(argv) {
  const parsed = { help: false, paths: {}, attestations: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (arg === '--restore-evidence' || arg === '--destination-evidence') {
      if (parsed.paths[arg]) throw new Error('duplicate_argument:' + arg);
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error('missing_path:' + arg);
      parsed.paths[arg] = value;
      continue;
    }
    if (FLAG_NAMES.has(arg)) {
      if (parsed.attestations.has(arg)) throw new Error('duplicate_argument:' + arg);
      parsed.attestations.add(arg);
      continue;
    }
    throw new Error('unknown_argument:' + arg);
  }
  return parsed;
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
    if (args.help) {
      process.stdout.write(USAGE + '\n');
      return 0;
    }
    const restorePath = args.paths['--restore-evidence'];
    const destinationPath = args.paths['--destination-evidence'];
    if (!restorePath || !destinationPath) throw new Error('both_evidence_files_required');
    const restoreEvidence = readEvidence('--restore-evidence', restorePath);
    const destinationEvidence = readEvidence('--destination-evidence', destinationPath);
    const decision = decidePreviewRelease({
      restoreEvidence,
      destinationEvidence,
      isolatedRestoreVerified: args.attestations.has('--isolated-restore-verified'),
      mobileBrowserVerified: args.attestations.has('--mobile-browser-verified'),
      zeroApiRequestsVerified: args.attestations.has('--zero-api-requests-verified'),
      humanReviewVerified: args.attestations.has('--human-review-verified'),
      authenticatedHumanReviewAttested: args.attestations.has('--authenticated-human-review-attested')
    });
    const output = {
      ...decision,
      evidenceFilesRead: true,
      attestationFlagsSupplied: args.attestations.size,
      deploymentPerformed: false,
      note: 'فقط شکل و سازگاری اظهارهای ورودی بررسی شده است؛ اصالت مدرک، بازیابی واقعی، مقصد زنده، احراز هویت مستقل بازبین و مجوز مالک احراز نشده‌اند. این ابزار هرگز مجوز انتشار صادر نمی‌کند.'
    };
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    // Exit 3 means the JSON shape passed but external evidence/release approval remain unverified.
    return decision.blockers.length ? 1 : 3;
  } catch (error) {
    const output = {
      status: 'NOT_READY',
      blockers: [String(error && error.message || 'invalid_preflight_input').slice(0, 160)],
      deploymentPerformed: false
    };
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    return 2;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { main, parseArgs, readEvidence };
