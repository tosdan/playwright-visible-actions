// Garantisce che il codice di debug per i test non finisca nel pacchetto di
// deploy: compila l'app in produzione e fallisce se nel bundle trova uno dei
// marcatori del ponte di debug.
//
// uso: node scripts/check-prod-bundle.mjs [cartella-app]   (default: demo-angular)
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// Stringhe che esistono solo nel codice di debug (vedi src/app/router-debug.ts).
// Sono letterali, quindi sopravvivono alla minificazione se il codice viene incluso.
const MARKERS = ['__pwdbgRouter'];

const appDir = resolve(process.argv[2] ?? 'demo-angular');
const outDir = join(appDir, 'dist', '.bundle-check');

const filesIn = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesIn(join(dir, entry.name)) : [join(dir, entry.name)],
  );

const filesContaining = (files, marker) => files.filter((file) => readFileSync(file, 'utf8').includes(marker));

// Se un marcatore non è più nei sorgenti (rinominato, file spostato) il
// controllo passerebbe sempre senza verificare nulla: meglio fallire.
const sources = filesIn(join(appDir, 'src')).filter((file) => /\.(ts|js|html)$/.test(file));
const stale = MARKERS.filter((marker) => filesContaining(sources, marker).length === 0);
if (stale.length) {
  console.error(`✗ Marcatori assenti dai sorgenti: ${stale.join(', ')}. Aggiornare MARKERS in questo script.`);
  process.exit(1);
}

console.log(`Build di produzione di ${relative(process.cwd(), appDir) || '.'}…`);
rmSync(outDir, { recursive: true, force: true });
const build = spawnSync('npx ng build --configuration production --output-path dist/.bundle-check', {
  cwd: appDir,
  shell: true,
  stdio: ['ignore', 'pipe', 'inherit'],
  env: { ...process.env, NG_CLI_ANALYTICS: 'false' },
});
if (build.status !== 0) {
  console.error(build.stdout?.toString() ?? '');
  console.error('✗ La build di produzione è fallita.');
  process.exit(1);
}

try {
  const bundle = filesIn(outDir).filter((file) => /\.(js|mjs|html|css)$/.test(file));
  if (!bundle.some((file) => file.endsWith('.js'))) {
    console.error('✗ La build non ha prodotto file JavaScript: controllo non attendibile.');
    process.exit(1);
  }
  const leaks = MARKERS.flatMap((marker) =>
    filesContaining(bundle, marker).map((file) => `${marker} in ${relative(outDir, file)}`),
  );
  if (leaks.length) {
    console.error('✗ Codice di debug trovato nel bundle di produzione:');
    for (const leak of leaks) console.error(`   - ${leak}`);
    console.error('  Il ponte va registrato solo dietro `ngDevMode` (vedi src/app/app.config.ts).');
    process.exit(1);
  }
  console.log(`✓ Nessun codice di debug nel bundle di produzione (${bundle.length} file controllati).`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
