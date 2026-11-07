const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'duodialect-preview-'));
const chrome = spawn(process.env.CHROME_BIN || 'google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--remote-debugging-pipe', `--user-data-dir=${directory}/profile`], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
let buffer = '', sequence = 0, session, server, stderr = '';
const pending = new Map(), errors = [], requests = [];
chrome.stderr.on('data', chunk => { stderr += chunk; });
chrome.stdio[4].on('data', chunk => {
  buffer += chunk.toString(); let end;
  while ((end = buffer.indexOf('\0')) >= 0) {
    const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id); clearTimeout(timer); pending.delete(message.id);
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error' && !message.params.entry.url?.endsWith('/favicon.ico')) errors.push(message.params.entry);
    if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
  }
});
function send(method, params = {}, target = session) {
  return new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out. ${stderr.slice(-1000)}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    chrome.stdio[3].write(JSON.stringify({ id, method, params, ...(target ? { sessionId: target } : {}) }) + '\0');
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value;
}
async function until(expression) {
  for (let i = 0; i < 160; i++) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 50)); }
  throw new Error('Condition timed out: ' + expression);
}
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const field = (name, value) => evaluate(`(()=>{const e=document.querySelector('[name="${name}"]'); e.value=${JSON.stringify(value)}; e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
const submit = id => evaluate(`document.getElementById(${JSON.stringify(id)}).requestSubmit()`);
const state = () => evaluate(`JSON.parse(localStorage.getItem('duodialect.preview.v1'))`);
async function screenshot(name) { const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(path.join(directory, name), Buffer.from(r.data, 'base64')); }
async function profile(patch) {
  await click('#profile-button');
  for (const [key, value] of Object.entries(patch)) await field(key, value);
  await submit('profile-form'); assert.equal(await evaluate('document.querySelector("dialog").open'), false);
}
(async () => {
  server = (await import('../server.mjs')).createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/.env')).status, 404);
  assert.equal((await fetch(base + '/core.js')).status, 200);
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  session = (await send('Target.attachToTarget', { targetId, flatten: true })).sessionId;
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: base });
  await until('document.querySelectorAll("[data-person]").length===4');
  await screenshot('discover-desktop.png');
  await evaluate(`document.querySelector('#area-filter').value='Surry Hills';document.querySelector('#area-filter').dispatchEvent(new Event('change',{bubbles:true}))`);
  assert.equal(await evaluate('document.querySelectorAll("[data-person]").length'), 1);
  await evaluate(`document.querySelector('#slot-filter').value='Wednesday evening';document.querySelector('#slot-filter').dispatchEvent(new Event('change',{bubbles:true}))`);
  assert.equal(await evaluate('document.querySelectorAll("[data-person]").length'), 0);
  await click('[data-action="reset-filters"]');
  await click('[data-mode="date"]'); assert.equal(await evaluate('document.querySelectorAll("[data-person]").length'), 0);
  assert.equal(await evaluate('!!document.querySelector(".date-gate")'), true);
  await click('[data-mode="partner"]');
  await profile({ learns: 'Spanish', name: '<img src=x onerror=alert(1)>' });
  assert.equal(await evaluate('document.querySelectorAll("[data-person]").length'), 2);
  assert.equal(await evaluate('document.querySelectorAll("img").length'), 0);
  await send('Page.reload'); await until('document.querySelectorAll("[data-person]").length===2');
  assert.equal((await state()).profile.learns, 'Spanish');
  await profile({ name: 'Alex' });
  await click('[data-mode="group"]'); assert.equal(await evaluate('document.querySelectorAll(".group-card").length'), 1);
  await click('[data-action="join"]'); await field('repeat', 'weekly'); await submit('invite-form');
  assert.equal((await state()).plans[0].kind, 'group'); assert.equal((await state()).plans[0].repeat, 'weekly');
  await field('message', '<script>not executable</script>'); await submit('message-form');
  assert.equal(await evaluate('document.querySelectorAll("#modal-content script").length'), 0);
  assert.equal((await state()).plans[0].messages.length, 2);
  await click('[data-action="close"]'); await evaluate("location.hash='plans'"); await until('!!document.querySelector(".plan-card")');
  await screenshot('plans-desktop.png');
  await send('Page.reload'); await until('!!document.querySelector(".plan-card")');
  await click('[data-action="conversation"]'); assert.equal(await evaluate('document.querySelectorAll(".message").length'), 2);
  await click('[data-action="cancel-plan"]'); await click('[data-action="do-cancel"]');
  assert.equal((await state()).plans[0].status, 'cancelled');
  await profile({ learns: 'Japanese' }); await evaluate("location.hash='discover'"); await until('document.querySelectorAll("[data-person]").length===4');
  await click('[data-mode="date"]'); await click('[data-action="dating-settings"]');
  await click('#dating-toggle'); await field('ageMax', '30');
  await evaluate(`document.querySelectorAll('[name="datingGenders"]').forEach(e=>e.checked=e.value==='Woman')`);
  await submit('profile-form');
  assert.deepEqual(await evaluate('[...document.querySelectorAll("[data-person]")].map(e=>e.dataset.person)'), ['aiko']);
  await click('[data-action="invite"]'); await field('repeat', 'weekly'); await submit('invite-form');
  assert.equal((await state()).plans[1].kind, 'date');
  await click('[data-action="close"]'); await click('#profile-button'); await click('#dating-toggle'); await submit('profile-form');
  assert.equal((await state()).plans[1].status, 'cancelled');
  assert.equal(await evaluate('!!document.querySelector(".date-gate")'), true);
  await click('[data-mode="partner"]'); await click('[data-action="person"][data-id="aiko"]'); await click('[data-action="report"]'); await submit('report-form');
  assert.equal((await state()).reports.length, 1);
  await click('[data-action="person"][data-id="aiko"]'); await click('[data-action="block"]'); await click('[data-action="do-block"]');
  assert.equal(await evaluate('document.querySelectorAll("[data-person]").length'), 3);
  await click('[data-mode="group"]'); assert.equal(await evaluate('document.querySelectorAll(".group-card").length'), 1);
  await evaluate("location.hash='profile'"); await until('!!document.querySelector(".profile-summary")');
  await click('[data-action="unblock"]');
  await profile({ name: 'Alex' });
  await evaluate("location.hash='discover'"); await until('!!document.querySelector(".hero")');
  await click('[data-mode="partner"]');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.ok(await evaluate('document.documentElement.scrollWidth<=390'), '390px horizontal overflow');
  await screenshot('discover-mobile.png');
  await click('[data-action="invite"][data-id="aiko"]');
  assert.ok(await evaluate('document.querySelector("dialog").scrollWidth<=document.querySelector("dialog").clientWidth'), 'Dialog horizontal overflow');
  await screenshot('invitation-mobile.png');
  await click('[data-action="close"]');
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true });
  assert.ok(await evaluate('document.documentElement.scrollWidth<=320'), '320px horizontal overflow');
  // Simulate a storage write failure: edits stay visible, and the failure is disclosed.
  await evaluate("Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError')}");
  await profile({ name: 'Unsaved example' });
  assert.equal(await evaluate('document.getElementById("storage-warning").hidden'), false);
  assert.equal((await state()).profile.name, 'Alex');
  await send('Page.reload'); await until('!!document.querySelector(".hero")');
  await evaluate("localStorage.setItem('duodialect.preview.v1','{broken');window.beforeReload=true");
  await send('Page.reload'); await until('!window.beforeReload&&!!document.querySelector(".hero")');
  assert.equal(await evaluate('document.getElementById("storage-warning").hidden'), false);
  assert.equal(await evaluate("localStorage.getItem('duodialect.preview.v1')"), '{broken');
  await evaluate("location.hash='profile'"); await until('!!document.querySelector(".profile-summary")');
  await click('[data-action="reset"]'); await click('[data-action="do-reset"]');
  assert.equal(await state(), null);
  assert.equal(await evaluate('document.getElementById("storage-warning").hidden'), true);
  assert.ok(requests.filter(v => /^https?:/.test(v)).every(v => v.startsWith(base + '/')), 'Unexpected external request');
  assert.deepEqual(errors, []);
  console.log('PASS: reciprocal discovery, filters, opt-in dating, mutual preferences, recurring group and date invitations, cancellation, messages, persistence, reporting, blocking, corrupt storage and quota recovery, 390/320px layouts, no script errors or external requests.');
  console.log('Screenshots: ' + directory);
})().catch(async e => { console.error(e); if (session) { try { await screenshot('failure.png'); console.error('Artifacts: ' + directory); } catch {} } process.exitCode = 1; }).finally(() => { server?.close(); chrome.kill(); for (const p of pending.values()) clearTimeout(p.timer); });
