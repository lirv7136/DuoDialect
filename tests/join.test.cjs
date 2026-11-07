const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// The waitlist sign up (a Cloudflare Pages Function, an ES module) run against a stand in for
// its D1 database, which records the statement and the values bound to it.
const filename = path.resolve(__dirname, '..', 'site/functions/api/join.js');
const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
}).outputText;
const join = {};
vm.runInNewContext(source, { exports: join, Response, URL }, { filename });

function fakeDb() {
  const runs = [];
  return {
    runs,
    prepare: sql => ({ bind: (...values) => ({ run: async () => { runs.push({ sql, values }); return { success: true }; } }) }),
  };
}

function post(body) {
  return new Request('https://talkeven.com/api/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', origin: 'https://talkeven.com' },
    body: JSON.stringify(body),
  });
}

const person = { email: 'Mia@Example.com', first_name: 'Mia', speaks: 'English', learning: 'Japanese', suburb: 'Glebe', platform: 'ios', adult: true };

test('a repeat sign up updates every field it gives, the source included', async () => {
  const DB = fakeDb();
  const response = await join.onRequestPost({ request: post({ ...person, source: 'instagram' }), env: { DB } });
  assert.equal(response.status, 200);
  assert.equal(DB.runs.length, 1);
  const { sql, values } = DB.runs[0];

  const inserted = /INSERT INTO waitlist \(([^)]+)\)/.exec(sql)[1].split(',').map(column => column.trim());
  assert.equal(values.length, inserted.length);
  assert.equal(values[inserted.indexOf('source')], 'instagram');
  assert.equal(values[inserted.indexOf('email')], 'mia@example.com');

  const updates = /DO UPDATE SET([\s\S]+)$/.exec(sql)[1];
  for (const column of inserted.filter(name => name !== 'email')) {
    const parameter = `?${inserted.indexOf(column) + 1}`;
    assert.ok(new RegExp(`\\b${column} = (COALESCE\\(\\${parameter}, ${column}\\)|\\${parameter})`).test(updates),
      `${column} is updated from ${parameter}`);
  }
  assert.match(updates, /updated_at = datetime\('now'\)/);
  // A repeat sign up without a source keeps the one the row already has.
  assert.match(updates, /source = COALESCE\(\?7, source\)/);
});

test('a sign up without a source binds null, and a bad one writes nothing', async () => {
  const DB = fakeDb();
  await join.onRequestPost({ request: post(person), env: { DB } });
  assert.equal(DB.runs[0].values[6], null);

  const refused = await join.onRequestPost({ request: post({ ...person, learning: 'english' }), env: { DB } });
  assert.equal(refused.status, 400);
  assert.equal(DB.runs.length, 1);
});
