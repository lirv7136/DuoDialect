const fs = require('node:fs');
const path = require('node:path');
const report = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../docs/release-readiness.json'), 'utf8'));
console.log(`${report.target}\nEvidence review: ${report.reviewedOn}\n`);
for (const gate of report.gates) console.log(`${gate.status === 'passed' ? 'PASS' : 'PENDING'}  ${gate.name}\n         ${gate.evidence}`);
const pending = report.gates.filter(gate => gate.status !== 'passed');
console.log(pending.length ? `\nNot ready for store submission: ${pending.length} release gates remain.` : '\nAll recorded gates passed. Recheck the evidence against the exact submission build.');
console.log('This reports recorded evidence; it does not run tests, trigger builds or submit an app.');
process.exitCode = pending.length ? 1 : 0;
