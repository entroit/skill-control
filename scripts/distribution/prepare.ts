import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from './build';
import { targets, type Target } from './targets';

const manifest = await Bun.file(resolve(import.meta.dir, '../../package.json')).json();
const selected = process.argv.slice(2);
const keys = (selected.length ? selected : Object.keys(targets)) as Target[];
for (const key of keys) if (!(key in targets)) throw new Error(`Unknown target ${key}`);
const root = resolve('dist/npm');
await rm(root, { recursive: true, force: true });
await mkdir(root, { recursive: true });
const optionalDependencies: Record<string, string> = {};
for (const key of keys) {
  const target = targets[key];
  const folder = resolve(root, key);
  const name = `${manifest.name}-${key}`;
  optionalDependencies[name] = manifest.version;
  await build(resolve(folder, 'bin', target.os === 'win32' ? 'sctl.exe' : 'sctl'), key);
  await cp(resolve(import.meta.dir, '../../LICENSE'), resolve(folder, 'LICENSE'));
  await Bun.write(resolve(folder, 'package.json'), JSON.stringify({
    name, version: manifest.version, description: `${manifest.description} (${key})`,
    license: manifest.license, repository: manifest.repository,
    os: [target.os], cpu: [target.cpu], ...('libc' in target ? { libc: [target.libc] } : {}),
    files: ['bin', 'LICENSE'], publishConfig: { access: 'public' },
  }, null, 2) + '\n');
}
const main = resolve(root, 'main');
await mkdir(main, { recursive: true });
await cp(resolve(import.meta.dir, '../../bin'), resolve(main, 'bin'), { recursive: true });
for (const file of ['README.md', 'LICENSE']) {
  const source = resolve(import.meta.dir, '../..', file);
  if (await Bun.file(source).exists()) await cp(source, resolve(main, file));
}
const { scripts, devDependencies, packageManager, private: sourceOnly, ...publicManifest } = manifest;
await Bun.write(resolve(main, 'package.json'), JSON.stringify({
  ...publicManifest, optionalDependencies, publishConfig: { access: 'public' },
}, null, 2) + '\n');
console.log(`Prepared ${keys.length} native packages and the npm launcher under ${root}. Nothing was published.`);
