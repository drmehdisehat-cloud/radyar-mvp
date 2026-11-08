'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { assertRestoreEvidence } = require('../scripts/check-isolated-restore-evidence.cjs');
test('isolated restore evidence remains explicitly insufficient for release', t => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(),'dadyar-restore-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const archive=path.join(dir,'backup.tar.gz'); fs.writeFileSync(archive,'synthetic archive fixture');
 const restoredRoot=path.join(dir,'restored');fs.mkdirSync(restoredRoot);
 fs.writeFileSync(path.join(restoredRoot,'index.html'),'synthetic restored file');
 const sha=crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
 const args={archive,restoredRoot,marker:'index.html',expectedArchiveSha256:sha};
 const evidence=assertRestoreEvidence(args);
 assert.equal(evidence.restore_proven,false);
 assert.equal(evidence.archive_sha256,sha);
 assert.throws(()=>assertRestoreEvidence({...args,expectedArchiveSha256:'0'.repeat(64)}),/mismatch/);
 assert.throws(()=>assertRestoreEvidence({...args,marker:'../backup.tar.gz'}),/relative path/);
 fs.rmSync(path.join(restoredRoot,'index.html'));
 assert.throws(()=>assertRestoreEvidence(args),/ENOENT/);
});

test('rejects an intermediate symlink even when its target remains inside restored root', t => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dadyar-restore-link-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const archive=path.join(dir,'backup.tar.gz'); fs.writeFileSync(archive,'synthetic archive fixture');
 const root=path.join(dir,'restored'); fs.mkdirSync(root);
 const actual=path.join(root,'actual'); fs.mkdirSync(actual);
 fs.writeFileSync(path.join(actual,'index.html'),'synthetic');
 fs.symlinkSync(actual,path.join(root,'alias'),'dir');
 const expectedArchiveSha256=crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
 assert.throws(()=>assertRestoreEvidence({archive,restoredRoot:root,marker:'alias/index.html',expectedArchiveSha256}),/symlink/);
});

test('rejects symlinked archive and restored root even with valid synthetic hash', t => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dadyar-restore-toplink-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const archive=path.join(dir,'archive.tar.gz'); fs.writeFileSync(archive,'synthetic archive');
 const root=path.join(dir,'actual-root'); fs.mkdirSync(root);
 fs.writeFileSync(path.join(root,'index.html'),'synthetic marker');
 const archiveLink=path.join(dir,'archive-link.tar.gz'); fs.symlinkSync(archive,archiveLink);
 const rootLink=path.join(dir,'root-link'); fs.symlinkSync(root,rootLink,'dir');
 const expectedArchiveSha256=crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
 const args={archive,restoredRoot:root,marker:'index.html',expectedArchiveSha256};
 assert.equal(assertRestoreEvidence(args).restore_proven,false);
 assert.throws(()=>assertRestoreEvidence({...args,archive:archiveLink}),/archive must not be a symlink/);
 assert.throws(()=>assertRestoreEvidence({...args,restoredRoot:rootLink}),/restored root must not be a symlink/);
});

test('rejects symlinked parent directories for archive and restore root', t => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dadyar-restore-ancestor-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const actual=path.join(dir,'actual'); fs.mkdirSync(actual);
 const archive=path.join(actual,'backup.tar.gz'); fs.writeFileSync(archive,'synthetic archive');
 const root=path.join(actual,'restored'); fs.mkdirSync(root);
 fs.writeFileSync(path.join(root,'index.html'),'synthetic marker');
 const alias=path.join(dir,'alias'); fs.symlinkSync(actual,alias,'dir');
 const expectedArchiveSha256=crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
 const args={archive,restoredRoot:root,marker:'index.html',expectedArchiveSha256};
 assert.equal(assertRestoreEvidence(args).restore_proven,false);
 assert.throws(()=>assertRestoreEvidence({...args,archive:path.join(alias,'backup.tar.gz')}),/archive path must not contain symlinks/);
 assert.throws(()=>assertRestoreEvidence({...args,restoredRoot:path.join(alias,'restored')}),/restored root path must not contain symlinks/);
});
