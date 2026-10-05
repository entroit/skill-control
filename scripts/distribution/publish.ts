import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { npmCommand } from './npm-command';
import { targets } from './targets';

if (process.argv[2] !== '--confirm-publication') {
  throw new Error('Publication requires --confirm-publication. Use release:prepare to build without publishing.');
}
const bootstrap = process.argv[3] === '--bootstrap-without-provenance';
if (process.argv.length > (bootstrap ? 4 : 3)) throw new Error('Unknown publication option');
if (bootstrap && process.env.GITHUB_ACTIONS === 'true') {
  throw new Error('GitHub Actions publication must include provenance');
}
const root = resolve('dist/npm');
const packages = (await readdir(root, { withFileTypes: true }))
  .filter(entry => entry.isDirectory() && entry.name !== 'main')
  .map(entry => entry.name).sort();
if (packages.length !== Object.keys(targets).length || packages.some(folder => !Object.hasOwn(targets, folder))) {
  throw new Error('Publication requires every supported platform package. Run release:prepare without a target filter.');
}
const main = await Bun.file(resolve(root, 'main/package.json')).json();
for (const folder of packages) {
  const native = await Bun.file(resolve(root, folder, 'package.json')).json();
  if (native.version !== main.version || main.optionalDependencies?.[native.name] !== main.version) {
    throw new Error(`Prepared package ${folder} does not match the main package lockstep version`);
  }
}
if (Object.keys(main.optionalDependencies ?? {}).length !== packages.length) {
  throw new Error('Prepared platform packages are incomplete');
}
for (const name of [...packages, 'main']) {
  const proc = Bun.spawn(npmCommand(['publish', '--access', 'public', ...(bootstrap ? [] : ['--provenance'])]), {
    cwd: resolve(root, name), stdout: 'inherit', stderr: 'inherit', stdin: 'inherit',
  });
  if (await proc.exited !== 0) throw new Error(`Publication stopped at ${name}`);
}
