'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../dadyar-preview/index.html'),'utf8');
test('deployable offline preview has mobile RTL and no remote resource paths',()=>{
 assert.match(html,/<html\s+lang="fa"\s+dir="rtl"/);
 assert.match(html,/<meta\s+name="viewport"\s+content="width=device-width,initial-scale=1"/);
 assert.match(html,/connect-src 'none'/);
 assert.match(html,/form-action 'none'/);
 assert.doesNotMatch(html,/<(?:script|link|iframe|img|audio|video|source)\b[^>]*(?:src|href)\s*=/i);
 assert.doesNotMatch(html,/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/);
 assert.match(html,/id="free-question"/);
 assert.match(html,/id="export-ack"/);
 assert.match(html,/downloadButton\.disabled=!exportEligible \|\| !exportAck\.checked/);
 assert.match(html,/exportAck\.checked=false;updateExportPermission\(\)/);
});
