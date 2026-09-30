// Builds the game: inlines src/game.js into src/template.html at the /*GAME*/ placeholder.
//   node build.js                       dist/index.html, the English release build (committed)
//   node build.js --test                tools/out/test.html, the English test build
//   node build.js --lang=ru             tools/out/ru/index.html, the Russian release build
//   node build.js --lang=ru --test      tools/out/ru/test.html, the Russian test build
//   --out=<path>                        writes there instead (the Pages workflow builds site/ this way)
const fs = require('fs');
const path = require('path');

const root = __dirname;
const tpl = fs.readFileSync(path.join(root, 'src', 'template.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'src', 'game.js'), 'utf8');
if (!tpl.includes('/*GAME*/')) throw new Error('src/template.html is missing the /*GAME*/ placeholder');

const arg = name => { const a = process.argv.find(s => s.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : null; };
const isTest = process.argv.includes('--test');
const lang = arg('lang') || 'en';
if (lang !== 'en' && lang !== 'ru') throw new Error('--lang must be en or ru, not ' + lang);
const outArg = arg('out');

const TEST_FLAG = "if (new URLSearchParams(window.location.search).has('test') || window.location.hash === '#test') setTestMode(true);";
if (isTest && !js.includes(TEST_FLAG)) throw new Error('src/game.js is missing the test-mode flag line');
// The shipping build keeps TEST_BUILD false: no T or S keys, no Skip fish button, no ?test. The test build flips it.
const TEST_BUILD = 'const TEST_BUILD = false;';
if (!js.includes(TEST_BUILD)) throw new Error('src/game.js is missing the TEST_BUILD line');
// One page per language: the page's language is baked in; ?lang=en or ?lang=ru still overrides it.
const DEFAULT_LANG = "const DEFAULT_LANG = 'en';";
if (!js.includes(DEFAULT_LANG)) throw new Error('src/game.js is missing the DEFAULT_LANG line');

let code = js.replace(DEFAULT_LANG, "const DEFAULT_LANG = '" + lang + "';");
if (isTest) code = code.replace(TEST_FLAG, 'setTestMode(true); // test build').replace(TEST_BUILD, 'const TEST_BUILD = true;');
// Full-line // comments are dropped from the build (they are a fifth of the source); the source keeps them.
const strip = c => c.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
const src = strip(code);

// The tab title and <html lang> before the script runs (link previews read them); staticText sets both again.
const TITLES = { en: ['Still Water', ' (test build)'], ru: ['Тихий омут', ' (тестовая сборка)'] };
const title = TITLES[lang][0] + (isTest ? TITLES[lang][1] : '');
const page = tpl.replace('<title>Still Water</title>', '<title>' + title + '</title>').replace('<html lang="en">', '<html lang="' + lang + '">');
const out = page.replace('/*GAME*/', () => src); // function form: no $-pattern substitution

const defaultDest = lang === 'ru'
  ? path.join(root, 'tools', 'out', 'ru', isTest ? 'test.html' : 'index.html')
  : isTest ? path.join(root, 'tools', 'out', 'test.html') : path.join(root, 'dist', 'index.html');
const dest = outArg ? path.resolve(root, outArg) : defaultDest;
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log('built ' + path.relative(root, dest) + ' (' + lang + (isTest ? ', test' : '') + ', ' + (out.length / 1024).toFixed(1) + ' KB)');
