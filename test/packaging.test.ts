import { describe, expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { cp, mkdir, mkdtemp, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { platformKey } = require('../bin/platform.cjs');

describe('npm bootstrap', () => {
  test('selects platform, architecture, and libc without executing a shell', () => {
    expect(platformKey('linux', 'x64', { header: { glibcVersionRuntime: '2.40' } })).toBe('linux-x64-glibc');
    expect(platformKey('linux', 'arm64', { header: {} })).toBe('linux-arm64-musl');
    expect(platformKey('darwin', 'arm64')).toBe('darwin-arm64');
    expect(platformKey('win32', 'arm64')).toBe('win32-arm64');
    expect(() => platformKey('freebsd', 'x64')).toThrow('Unsupported platform');
  });

  test('missing optional package gives an actionable error', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sctl-launcher-'));
    try {
      await cp(resolve('bin'), join(root, 'bin'), { recursive: true });
      const proc = Bun.spawn(['node', join(root, 'bin/sctl.cjs')], { stderr: 'pipe', stdout: 'pipe' });
      expect(await proc.exited).toBe(1);
      expect(await new Response(proc.stderr).text()).toContain('optional dependencies enabled');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  test('rejects a mismatched native version before executing it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sctl-launcher-'));
    try {
      await cp(resolve('bin'), join(root, 'bin'), { recursive: true });
      await Bun.write(join(root, 'package.json'), '{"version":"0.2.0"}');
      const pkg = join(root, 'node_modules', '@entroit', `skill-control-${platformKey()}`);
      await mkdir(pkg, { recursive: true });
      await Bun.write(join(pkg, 'package.json'), '{"version":"0.1.0"}');
      const proc = Bun.spawn(['node', join(root, 'bin/sctl.cjs')], { stderr: 'pipe', stdout: 'pipe' });
      expect(await proc.exited).toBe(1);
      expect(await new Response(proc.stderr).text()).toContain('expected 0.2.0');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  test('forwards arguments and child exit status', async () => {
    if (process.platform === 'win32') return; // Native Windows smoke is exercised in CI.
    const root = await mkdtemp(join(tmpdir(), 'sctl-launcher-'));
    try {
      await cp(resolve('bin'), join(root, 'bin'), { recursive: true });
      const pkg = join(root, 'node_modules', '@entroit', `skill-control-${platformKey()}`);
      await mkdir(join(pkg, 'bin'), { recursive: true });
      await Bun.write(join(root, 'package.json'), '{"version":"0.1.0"}');
      await Bun.write(join(pkg, 'package.json'), '{"version":"0.1.0"}');
      await Bun.write(join(pkg, 'bin/sctl'), '#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv.slice(2))); process.exit(7);\n');
      await chmod(join(pkg, 'bin/sctl'), 0o755);
      const proc = Bun.spawn(['node', join(root, 'bin/sctl.cjs'), 'skill', 'a b'], { stdout: 'pipe', stderr: 'pipe' });
      expect(await proc.exited).toBe(7);
      expect((await new Response(proc.stdout).text()).trim()).toBe('["skill","a b"]');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
