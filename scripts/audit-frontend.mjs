/** Check every source module, including components unreachable from the app entry. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const root = path.resolve(import.meta.dirname, '../frontend');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
const globals = new Set('undefined console window document navigator localStorage sessionStorage fetch URL URLSearchParams FormData File Blob Date Math Object Array Set Map String Number Boolean Promise JSON Error Intl RegExp parseInt parseFloat isNaN setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame alert confirm performance AbortController Event CustomEvent crypto process Buffer global structuredClone FileReader ResizeObserver'.split(' '));
let failures = [];
const files = fs.readdirSync(path.join(root, 'src'), { recursive: true }).filter((file) => /\.(jsx|js)$/.test(file));
for (const file of files) {
  const location = path.join(root, 'src', file);
  const ast = parse(fs.readFileSync(location, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  traverse(ast, {
    ReferencedIdentifier(p) {
      if (!p.scope.hasBinding(p.node.name) && !globals.has(p.node.name)) failures.push(`${file}:${p.node.loc.start.line}: undefined ${p.node.name}`);
    },
    ImportDeclaration(p) {
      const source = p.node.source.value;
      if (source.startsWith('.')) {
        const base = path.resolve(path.dirname(location), source);
        if (![base, ...['.js', '.jsx', '/index.js', '/index.jsx'].map((suffix) => base + suffix)].some((name) => fs.existsSync(name))) failures.push(`${file}: missing ${source}`);
      } else {
        const name = source.startsWith('@') ? source.split('/').slice(0, 2).join('/') : source.split('/')[0];
        if (!dependencies[name]) failures.push(`${file}: undeclared dependency ${name}`);
        try { require.resolve(source); } catch { failures.push(`${file}: unresolved import ${source}`); }
      }
    },
  });
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`Checked ${files.length} frontend modules: no undefined references, missing imports, or undeclared dependencies.`);
