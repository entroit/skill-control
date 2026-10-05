import { mkdir, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { targets, type Target } from './targets';

export async function build(outfile: string, target?: Target): Promise<void> {
  await mkdir(resolve(outfile, '..'), { recursive: true });
  const result = await Bun.build({
    entrypoints: [resolve(import.meta.dir, 'native-entry.ts')],
    compile: { outfile, autoloadDotenv: false, autoloadBunfig: false, ...(target ? { target: targets[target].bun } : {}) },
    format: 'esm',
    bytecode: true,
    bytecodeDepth: 1,
    minify: true,
    sourcemap: 'linked',
  });
  if (!result.success) throw new AggregateError(result.logs, 'Native CLI build failed');
  if (!outfile.endsWith('.exe')) await chmod(outfile, 0o755);
}

if (import.meta.main) {
  const target = process.argv[2] as Target | undefined;
  if (target && !(target in targets)) throw new Error(`Unknown target ${target}`);
  await build(resolve('dist', target?.startsWith('win32') || (!target && process.platform === 'win32') ? 'sctl.exe' : 'sctl'), target);
}
