// Builds dist/index.html: inlines src/game.js into src/template.html at the /*GAME*/ placeholder.
const fs = require('fs');
const path = require('path');

const root = __dirname;
const tpl = fs.readFileSync(path.join(root, 'src', 'template.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'src', 'game.js'), 'utf8');
if (!tpl.includes('/*GAME*/')) throw new Error('src/template.html is missing the /*GAME*/ placeholder');

const isTest = process.argv.includes('--test');
const TEST_FLAG = "if (new URLSearchParams(window.location.search).has('test') || window.location.hash === '#test') setTestMode(true);";
if (isTest && !js.includes(TEST_FLAG)) throw new Error('src/game.js is missing the test-mode flag line');
// Full-line // comments are dropped from the build (they are a fifth of the source); the source keeps them.
const strip = code => code.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
const src = strip(isTest ? js.replace(TEST_FLAG, 'setTestMode(true); // test build') : js);
const page = isTest ? tpl.replace('<title>Still Water</title>', '<title>Still Water (test build)</title>') : tpl;
const out = page.replace('/*GAME*/', () => src); // function form: no $-pattern substitution
const dest = isTest ? path.join(root, 'tools', 'out', 'test.html') : path.join(root, 'dist', 'index.html');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log('built ' + path.relative(root, dest) + ' (' + (out.length / 1024).toFixed(1) + ' KB)');
