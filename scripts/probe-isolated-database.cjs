'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { TextDecoder } = require('node:util');
const { readStableRegularFile } = require('./stable-file-integrity.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const MAX_DEFAULTS_BYTES = 16 * 1024;
const QUERY = "SELECT DATABASE(), SUBSTRING_INDEX(CURRENT_USER(), '@', 1), 1, VERSION()";
const IDENTIFIER = /^[A-Za-z0-9_][A-Za-z0-9_$-]{0,63}$/;
const TARGET_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const ALLOWED_OPTIONS = new Set([
  'user', 'password', 'host', 'port', 'socket', 'protocol',
  'ssl-mode', 'ssl-ca', 'ssl-cert', 'ssl-key', 'ssl-cipher',
  'ssl-verify-server-cert', 'tls-version', 'connect-timeout',
  'default-character-set'
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith('..' + path.sep) &&
    relative !== '..' && !path.isAbsolute(relative));
}

function assertNoSymlinkPath(target, label) {
  const root = path.parse(target).root;
  const parts = target.slice(root.length).split(path.sep).filter(Boolean);
  let current = root;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const stat = fs.lstatSync(current, { bigint: true });
    if (stat.isSymbolicLink()) fail(label + '_symlink_forbidden');
    if (index === parts.length - 1) {
      if (!stat.isFile()) fail(label + '_must_be_regular_file');
    } else if (!stat.isDirectory()) {
      fail(label + '_parent_must_be_directory');
    }
  }
  if (fs.realpathSync(target) !== target) fail(label + '_must_be_canonical');
}

function assertTrustedParents(target) {
  if (process.platform === 'win32') return;
  const serviceUid = typeof process.geteuid === 'function' ? BigInt(process.geteuid()) : null;
  if (serviceUid === null) fail('defaults_file_owner_unverifiable');
  const parent = path.dirname(target);
  const root = path.parse(parent).root;
  let current = root;
  const parts = parent.slice(root.length).split(path.sep).filter(Boolean);
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const stat = fs.lstatSync(current, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('defaults_parent_not_trusted');
    if (stat.uid !== 0n && stat.uid !== serviceUid) fail('defaults_parent_owner_invalid');
    const mode = stat.mode & 0o7777n;
    if ((mode & 0o6000n) !== 0n) fail('defaults_parent_special_mode');
    if ((mode & 0o022n) !== 0n &&
        !(stat.uid === 0n && (mode & 0o1000n) !== 0n)) {
      fail('defaults_parent_writable_by_others');
    }
  }
}

function validateDefaultsFile(file, expectedUser) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.resolve(file) !== file) {
    fail('defaults_file_path_invalid');
  }
  if (isInside(REPO_ROOT, file)) fail('defaults_file_inside_git_checkout');
  assertNoSymlinkPath(file, 'defaults_file');
  assertTrustedParents(file);
  const result = readStableRegularFile(file, 'mysql defaults file', { maxBytes: MAX_DEFAULTS_BYTES, includeBytes: true });
  if (process.platform !== 'win32') {
    const serviceUid = BigInt(process.geteuid());
    if (result.stat.uid !== 0n && result.stat.uid !== serviceUid) fail('defaults_file_owner_invalid');
    const mode = result.stat.mode & 0o7777n;
    if ((mode & 0o7000n) !== 0n || (mode & 0o077n) !== 0n) {
      fail('defaults_file_must_be_owner_only');
    }
  }
  let content;
  try { content = new TextDecoder('utf-8', { fatal: true }).decode(result.bytes); }
  catch { fail('defaults_file_not_utf8'); }
  const lines = content.split(/\r?\n/);
  let groupCount = 0;
  let inClientGroup = false;
  const seen = new Set();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    if (/^!include(?:dir)?\b/i.test(line)) fail('defaults_file_include_forbidden');
    if (/^\[[^\]]+\]$/.test(line)) {
      groupCount += 1;
      inClientGroup = line.toLowerCase() === '[client]';
      if (!inClientGroup) fail('defaults_file_group_forbidden');
      continue;
    }
    if (!inClientGroup) fail('defaults_file_option_outside_client_group');
    const match = /^([a-z][a-z0-9_-]*)\s*=\s*(.*)$/i.exec(line);
    if (!match) fail('defaults_file_option_invalid');
    const key = match[1].toLowerCase();
    if (!ALLOWED_OPTIONS.has(key) || seen.has(key)) fail('defaults_file_option_forbidden');
    seen.add(key);
    if (key === 'user' && match[2] !== expectedUser) fail('defaults_file_user_mismatch');
  }
  if (groupCount !== 1 || !inClientGroup) fail('defaults_file_client_group_required');
  return Buffer.from(result.bytes);
}

function validateTimestamp(value) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function probeIsolatedDatabase({
  defaultsFile,
  expectedDatabase,
  expectedUser,
  productionDatabase,
  productionUser,
  restoreTargetId,
  spawn = spawnSync,
  mysqlBinary = 'mysql',
  now = () => new Date().toISOString()
} = {}) {
  for (const [value, label] of [
    [expectedDatabase, 'expected_database'],
    [expectedUser, 'expected_user'],
    [productionDatabase, 'production_database'],
    [productionUser, 'production_user']
  ]) {
    if (typeof value !== 'string' || !IDENTIFIER.test(value)) fail(label + '_invalid');
  }
  if (expectedDatabase === productionDatabase || expectedUser === productionUser) {
    fail('production_database_or_user_reused');
  }
  if (typeof restoreTargetId !== 'string' || !TARGET_ID.test(restoreTargetId)) {
    fail('restore_target_id_invalid');
  }
  if (typeof mysqlBinary !== 'string' || mysqlBinary !== 'mysql') fail('mysql_binary_must_be_system_client');
  if (typeof spawn !== 'function' || typeof now !== 'function') fail('probe_dependency_invalid');

  const defaultsBytes = validateDefaultsFile(defaultsFile, expectedUser);
  const tempRoot = fs.realpathSync(os.tmpdir());
  const tempDirectory = fs.mkdtempSync(path.join(tempRoot, 'dadyar-db-probe-'));
  let tempFile;
  try {
    fs.chmodSync(tempDirectory, 0o700);
    if (fs.realpathSync(tempDirectory) !== tempDirectory) fail('temporary_directory_not_canonical');
    const directoryStat = fs.lstatSync(tempDirectory, { bigint: true });
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) fail('temporary_directory_invalid');
    if (process.platform !== 'win32') {
      const serviceUid = BigInt(process.geteuid());
      if (directoryStat.uid !== serviceUid || (directoryStat.mode & 0o7777n) !== 0o700n) {
        fail('temporary_directory_permissions_invalid');
      }
    }
    tempFile = path.join(tempDirectory, 'client.cnf');
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT |
      fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0);
    const fd = fs.openSync(tempFile, flags, 0o600);
    try {
      fs.writeFileSync(fd, defaultsBytes);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    const childEnv = {
      PATH: process.env.PATH || '/usr/bin:/bin',
      HOME: tempDirectory,
      LANG: 'C',
      LC_ALL: 'C'
    };
    const result = spawn(mysqlBinary, [
      '--defaults-file=' + tempFile,
      '--user=' + expectedUser,
      '--database=' + expectedDatabase,
      '--connect-timeout=5',
      '--batch',
      '--raw',
      '--skip-column-names',
      '--execute',
      QUERY
    ], {
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 4096,
      windowsHide: true,
      env: childEnv
    });
    if (!result || result.error || result.status !== 0) fail('mysql_client_failed');
    const stdout = typeof result.stdout === 'string' ? result.stdout : '';
    const rows = stdout.trim().split(/\r?\n/);
    if (rows.length !== 1) fail('database_probe_output_invalid');
    const fields = rows[0].split('\t');
    if (fields.length !== 4 || fields[2] !== '1') fail('database_probe_output_invalid');
    const [databaseName, databaseUser, testValue, serverVersion] = fields;
    if (databaseName !== expectedDatabase || databaseUser !== expectedUser) {
      fail('database_probe_identity_mismatch');
    }
    if (!serverVersion || serverVersion.length > 128 || /[^\x20-\x7e]/.test(serverVersion)) {
      fail('database_probe_version_invalid');
    }
    const observedAt = now();
    if (!validateTimestamp(observedAt)) fail('database_probe_timestamp_invalid');
    return Object.freeze({
      schema: 'dadyar-isolated-db-probe-v1',
      probe_ok: true,
      query: QUERY,
      database_name: databaseName,
      database_user: databaseUser,
      connection_test_value: Number(testValue),
      server_version: serverVersion,
      restore_target_id: restoreTargetId,
      database_name_separation_verified: true,
      database_user_separation_verified: true,
      observed_at_utc: observedAt
    });
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

const FLAGS = Object.freeze([
  '--defaults-file', '--expected-database', '--expected-user',
  '--production-database', '--production-user', '--restore-target-id'
]);

function parseArgs(argv) {
  const values = Object.create(null);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') return { help: true };
    if (!FLAGS.includes(flag)) fail('unknown_argument');
    if (Object.hasOwn(values, flag)) fail('duplicate_argument');
    const value = argv[++index];
    if (!value || value.startsWith('--')) fail('missing_argument_value');
    values[flag] = value;
  }
  for (const flag of FLAGS) if (!values[flag]) fail('required_argument_missing');
  return { values };
}

function main(argv) {
  let parsed;
  try { parsed = parseArgs(argv); }
  catch (error) {
    process.stderr.write('NOT_VERIFIED: ' + (error.code || 'invalid_arguments') + '\n');
    return 2;
  }
  if (parsed.help) {
    process.stdout.write([
      'Usage:',
      '  node scripts/probe-isolated-database.cjs --defaults-file /secure/staging-mysql.cnf --expected-database STAGING_DB --expected-user STAGING_USER --production-database PRODUCTION_DB --production-user PRODUCTION_USER --restore-target-id SANDBOX_ID',
      'The defaults file must be owner-only, outside the Git checkout, and contain only one [client] group.',
      'The probe performs a read-only SELECT and never prints credentials.'
    ].join('\n') + '\n');
    return 0;
  }
  const v = parsed.values;
  try {
    const result = probeIsolatedDatabase({
      defaultsFile: v['--defaults-file'],
      expectedDatabase: v['--expected-database'],
      expectedUser: v['--expected-user'],
      productionDatabase: v['--production-database'],
      productionUser: v['--production-user'],
      restoreTargetId: v['--restore-target-id']
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 0;
  } catch (error) {
    process.stderr.write('NOT_VERIFIED: ' + (error.code || 'database_probe_failed') + '\n');
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { QUERY, probeIsolatedDatabase, parseArgs, validateTimestamp };
