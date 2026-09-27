// Builds dist/index.html: inlines src/game.js into src/template.html at the /*GAME*/ placeholder.
const fs = require('fs');
const path = require('path');

const root = __dirname;
const tpl = fs.readFileSync(path.join(root, 'src', 'template.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'src', 'game.js'), 'utf8');
if (!tpl.includes('/*GAME*/')) throw new Error('src/template.html is missing the /*GAME*/ placeholder');

const out = tpl.replace('/*GAME*/', () => js); // function form: no $-pattern substitution
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), out);
console.log('built dist/index.html (' + (out.length / 1024).toFixed(1) + ' KB)');
