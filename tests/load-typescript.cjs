const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Unit tests execute the real TypeScript module with explicit platform adapters.
// npm run typecheck separately verifies full types; no Firebase service is contacted.
module.exports = function loadTypeScript(relative, adapters = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: name => {
    if (Object.hasOwn(adapters, name)) return adapters[name];
    throw new Error(`Test has no adapter for ${name}`);
  } }, { filename });
  return exports;
};
