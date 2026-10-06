/**
 * One-off migration tool (Phase 1 -> Phase 3).
 *
 * Imports the ORIGINAL frontend dummy-data modules and snapshots every export to JSON
 * under `scripts/extracted/`. The backend seed and the mock external service are built
 * from these snapshots, so the API contract matches the existing UI by construction
 * instead of by hand-transcription.
 *
 * Run from the repo root:  node scripts/extract-frontend-data.mjs
 */
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = resolve(here, '..', 'frontend', 'src', 'data');
const OUT_DIR = resolve(here, 'extracted');

/**
 * `data/security.js` attaches extra scalar properties onto an exported *array*
 * (campusSecurityContacts.emergency, .dispatch, ...). JSON.stringify drops those, so
 * arrays carrying own enumerable string keys are serialised as { items, ...extras }.
 */
function serialise(value) {
  if (Array.isArray(value)) {
    const extraKeys = Object.keys(value).filter((k) => !/^\d+$/.test(k));
    if (extraKeys.length > 0) {
      const extras = {};
      for (const k of extraKeys) extras[k] = value[k];
      return { items: [...value], ...extras };
    }
    return [...value];
  }
  return value;
}

const files = (await readdir(SOURCE_DIR)).filter((f) => f.endsWith('.js')).sort();
await mkdir(OUT_DIR, { recursive: true });

const manifest = {};
for (const file of files) {
  const mod = await import(pathToFileURL(join(SOURCE_DIR, file)).href);
  const payload = {};
  for (const [name, value] of Object.entries(mod)) {
    if (name === 'default') continue;
    payload[name] = serialise(value);
  }
  const base = file.replace(/\.js$/, '');
  await writeFile(join(OUT_DIR, `${base}.json`), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  manifest[base] = Object.fromEntries(
    Object.entries(payload).map(([k, v]) => [k, Array.isArray(v) ? `array(${v.length})` : typeof v]),
  );
  console.log(`extracted ${file} -> ${base}.json  [${Object.keys(payload).join(', ')}]`);
}

await writeFile(join(OUT_DIR, '_manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`\n${files.length} modules extracted to ${OUT_DIR}`);
