'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { canonicalize, publicKeyFingerprint } = require('./verify-preview-staging-evidence.cjs');
function fail(code) { throw new Error(code); }
function signPayload(payload, privateKeyPem) {
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== 'ed25519') fail('attestation_key_must_be_ed25519');
  const fingerprint = publicKeyFingerprint(crypto.createPublicKey(privateKey));
  const signature = crypto.sign(null, Buffer.from(canonicalize(payload), 'utf8'), privateKey).toString('base64');
  return { keyFingerprint: fingerprint, signatureBase64: signature };
}
function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith('--')) { positional.push(value); continue; }
    const key = value.slice(2);
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) fail('missing_argument_for_' + key);
    flags[key] = argv[++i];
  }
  return { positional, flags };
}
function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const evidencePath = parsed.positional[0];
  const role = parsed.flags.role;
  const privateKeyPath = parsed.flags['private-key'];
  if (!evidencePath || parsed.positional.length !== 1 || !['operator', 'reviewer'].includes(role) || !privateKeyPath) fail('usage: node sign-preview-staging-evidence.cjs evidence.json --role operator|reviewer --private-key FILE');
  const absoluteEvidencePath = path.resolve(evidencePath);
  if (!path.isAbsolute(evidencePath) || absoluteEvidencePath !== evidencePath) fail('evidence_path_must_be_absolute_canonical');
  const evidenceStat = fs.lstatSync(absoluteEvidencePath);
  if (!evidenceStat.isFile() || evidenceStat.isSymbolicLink()) fail('evidence_file_must_be_regular_non_symlink');
  const evidence = JSON.parse(fs.readFileSync(absoluteEvidencePath, 'utf8'));
  if (!evidence || !evidence.payload || typeof evidence.payload !== 'object') fail('evidence_payload_missing');
  const privateKey = fs.readFileSync(privateKeyPath);
  const attestation = signPayload(evidence.payload, privateKey);
  evidence.attestations = evidence.attestations || {};
  evidence.attestations[role] = attestation;
  const temporary = absoluteEvidencePath + '.signed-' + process.pid;
  fs.writeFileSync(temporary, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  fs.renameSync(temporary, absoluteEvidencePath);
  process.stdout.write(JSON.stringify({ role, keyFingerprint: attestation.keyFingerprint, signed: true }) + '\n');
}
if (require.main === module) {
  try { main(); }
  catch (error) {
    process.stderr.write(JSON.stringify({ signed: false, reason: error.message }) + '\n');
    process.exitCode = 2;
  }
}
module.exports = { signPayload };
