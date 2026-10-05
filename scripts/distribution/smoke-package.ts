import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { npmCommand } from './npm-command';

const require = createRequire(import.meta.url);
const { platformKey } = require('../../bin/platform.cjs');
const root = resolve('dist/npm');
const key = platformKey();
const temp = await mkdtemp(join(tmpdir(), 'sctl-npm-'));
const mainPath = join(root, 'main/package.json');
const original = await Bun.file(mainPath).text();
async function run(args: string[], cwd: string) {
  const proc = Bun.spawn(args[0] === 'npm' ? npmCommand(args.slice(1)) : args, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(`${args.join(' ')} failed (${code})\n${stderr}`);
  return stdout;
}
try {
  const nativeResult = JSON.parse(await run(['npm', 'pack', '--json', '--pack-destination', temp], join(root, key)));
  const nativeTarball = join(temp, nativeResult[0].filename);
  const manifest = JSON.parse(original);
  // Local artifact smoke never fetches native executables from a registry.
  manifest.optionalDependencies = { [`${manifest.name}-${key}`]: `file:${nativeTarball}` };
  await Bun.write(mainPath, JSON.stringify(manifest, null, 2) + '\n');
  const mainResult = JSON.parse(await run(['npm', 'pack', '--json', '--pack-destination', temp], join(root, 'main')));
  const mainTarball = join(temp, mainResult[0].filename);
  await Bun.write(join(temp, 'package.json'), '{"private":true}');
  const output = await run(['npm', 'exec', '--yes', '--package', mainTarball, '--', 'sctl', '--help'], temp);
  if (!output.includes('sctl')) throw new Error('Packaged help output is missing the CLI name');
  console.log('npm exec launched the packed native CLI through Node without installing Bun.');
} finally {
  await Bun.write(mainPath, original);
  await rm(temp, { recursive: true, force: true });
}
