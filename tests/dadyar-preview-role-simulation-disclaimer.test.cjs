'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../dadyar-preview/index.html'), 'utf8');

test('all professional roles are clearly labeled as educational simulations in UI and exported report', () => {
  const roles = ['وکیل', 'قاضی', 'دادستان', 'ضابط', 'سردفتر'];
  const roleLabel = html.match(/<label for="role">([^<]+)<\/label>/)?.[1];
  assert.equal(roleLabel, 'نقش شبیه‌سازی آموزشی');

  const notice = html.match(/<p id="role-simulation-notice" role="note">([^<]+)<\/p>/)?.[1];
  assert.ok(notice, 'visible role simulation notice is missing');
  for (const role of roles) {
    assert.ok(notice.includes(role), 'simulation notice omits role: ' + role);
    assert.match(html, new RegExp('<option>' + role + '<\\/option>'));
  }
  assert.match(notice, /صرفاً شبیه‌سازی آموزشی‌اند/);
  assert.match(notice, /هیچ سمت، اختیار یا اثر حقوقی واقعی ایجاد نمی‌کنند/);

  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  assert.match(script, /const roleSimulationNotice=/);
  const reportBuilder = script.slice(script.indexOf("report=['دادیار"), script.indexOf('out.textContent=report'));
  assert.ok(reportBuilder.includes('roleSimulationNotice'), 'exported report omits the simulation boundary');
  assert.match(reportBuilder, /منابع قانونی: تأییدنشده؛ هیچ استناد قانونی ارائه نمی‌شود/);
  assert.match(reportBuilder, /صلاحیت و مسیر اقدام: تعیین‌نشده/);
});
