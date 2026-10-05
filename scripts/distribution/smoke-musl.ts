import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const stage = await mkdtemp(join(tmpdir(), 'sctl-musl-'));
try {
  const scope = join(stage, 'node_modules/@entroit');
  await mkdir(scope, { recursive: true });
  await cp(resolve('dist/npm/main'), join(scope, 'skill-control'), { recursive: true });
  await cp(resolve('dist/npm/linux-x64-musl'), join(scope, 'skill-control-linux-x64-musl'), { recursive: true });
  const proc = Bun.spawn([
    'docker', 'run', '--rm', '--volume', `${stage}:/package:ro`,
    'node:24-alpine', 'node', '/package/node_modules/@entroit/skill-control/bin/sctl.cjs', '--help',
  ], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0 || !stdout.includes('sctl')) throw new Error(`Alpine npm launcher smoke failed (${code})\n${stderr}`);
  console.log('Node launcher selected and executed the musl binary in Alpine without Bun installed.');
} finally {
  await rm(stage, { recursive: true, force: true });
}
