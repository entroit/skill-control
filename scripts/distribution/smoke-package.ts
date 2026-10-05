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
  if (code !== 0) throw new Error(`${args.join(' ')} failed (${code})\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  return { stdout, stderr };
}
function assertHelp(label: string, output: { stdout: string; stderr: string }) {
  if (!output.stdout.includes('sctl')) {
    throw new Error(`${label} exited successfully but did not print CLI help.\nstdout:\n${JSON.stringify(output.stdout)}\nstderr:\n${JSON.stringify(output.stderr)}`);
  }
}
try {
  const binary = join(root, key, 'bin', process.platform === 'win32' ? 'sctl.exe' : 'sctl');
  assertHelp('Direct native executable', await run([binary, '--help'], temp));
  const version = await run([binary, '--version'], temp);
  if (version.stdout.trim() !== JSON.parse(original).version) {
    throw new Error(`Native entry must run exactly once. Version stdout: ${JSON.stringify(version.stdout)}, stderr: ${JSON.stringify(version.stderr)}`);
  }
  const skill = await run([binary, 'skill'], temp);
  const expectedSkill = await Bun.file(resolve('skills/skill-control/SKILL.md')).text();
  if (skill.stdout.trim() !== expectedSkill.trim()) {
    throw new Error(`Native executable did not print the exact embedded skill. stdout: ${JSON.stringify(skill.stdout)}, stderr: ${JSON.stringify(skill.stderr)}`);
  }
  console.log('Direct native executable printed help, one version, and the exact embedded skill.');
  const nativeResult = JSON.parse((await run(['npm', 'pack', '--json', '--pack-destination', temp], join(root, key))).stdout);
  const nativeTarball = join(temp, nativeResult[0].filename);
  const manifest = JSON.parse(original);
  // Local artifact smoke never fetches native executables from a registry.
  manifest.optionalDependencies = { [`${manifest.name}-${key}`]: `file:${nativeTarball}` };
  await Bun.write(mainPath, JSON.stringify(manifest, null, 2) + '\n');
  const mainResult = JSON.parse((await run(['npm', 'pack', '--json', '--pack-destination', temp], join(root, 'main'))).stdout);
  const mainTarball = join(temp, mainResult[0].filename);
  await Bun.write(join(temp, 'package.json'), '{"private":true}');
  const output = await run(['npm', 'exec', '--yes', '--package', mainTarball, '--', 'sctl', '--help'], temp);
  assertHelp('npm exec through the Node launcher', output);
  console.log('npm exec launched the packed native CLI through Node without installing Bun.');
} finally {
  await Bun.write(mainPath, original);
  await rm(temp, { recursive: true, force: true });
}
