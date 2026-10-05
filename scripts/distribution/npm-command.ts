import { dirname, resolve } from 'node:path';

export function npmCommand(args: string[]): string[] {
  if (process.platform !== 'win32') return ['npm', ...args];
  const executable = Bun.which('npm');
  if (!executable) throw new Error('npm is required to prepare or smoke-test npm packages');
  // Windows npm.cmd is a shell wrapper. Invoke the installed JS entry point directly.
  return ['node', resolve(dirname(executable), 'node_modules/npm/bin/npm-cli.js'), ...args];
}
