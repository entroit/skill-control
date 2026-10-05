import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, readFile, writeFile, realpath, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'sctl-test-'))); temporary.push(root);
  const source = join(root, 'source'), project = join(root, 'application'), home = join(root, 'home');
  await mkdir(source); await mkdir(project);
  await git(source, 'init'); await git(source, 'config', 'user.email', 'test@example.com'); await git(source, 'config', 'user.name', 'Test');
  await skill(source, 'review', 'First'); await git(source, 'add', '.'); await git(source, 'commit', '-m', 'first');
  return { root, source, project, home };
}
async function skill(root: string, n: string, body: string) {
  await mkdir(join(root, n), { recursive: true });
  await writeFile(join(root, n, 'SKILL.md'), `---\nname: ${n}\ndescription: A test skill\n---\n${body}\n`);
}
async function git(cwd: string, ...args: string[]) {
  const child = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [out, err, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (exit) throw new Error(err); return out.trim();
}
async function cli(home: string, project: string, ...args: string[]) {
  const child = Bun.spawn([process.execPath, join(import.meta.dir, '..', 'src', 'cli.ts'), ...args], { cwd: project, env: { ...process.env, SCTL_HOME: home }, stdout: 'pipe', stderr: 'pipe' });
  const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  return { out, err, code };
}
async function json(path: string) { return JSON.parse(await readFile(path, 'utf8')); }

test('install tracks Git sources, concrete files survive clone without source access', async () => {
  const f = await fixture();
  expect(await cli(f.home, f.project, 'install', f.source, '--path', 'review')).toMatchObject({ code: 0 });
  expect((await json(join(f.project, 'skills.lock.json'))).skills.review.commit).toMatch(/^[a-f0-9]{40}$/);
  await git(f.project, 'init'); await git(f.project, 'config', 'user.email', 'test@example.com'); await git(f.project, 'config', 'user.name', 'Test');
  await git(f.project, 'add', '.'); await git(f.project, 'commit', '-m', 'skills');
  const clone = join(f.root, 'clone'); await git(f.root, 'clone', f.project, clone); await rm(f.source, { recursive: true });
  expect(await readFile(join(clone, '.claude', 'skills', 'review', 'SKILL.md'), 'utf8')).toContain('First');
});

test('update targets global and projects, preserves pins/edits, prunes only on apply', async () => {
  const f = await fixture();
  expect((await cli(f.home, f.project, 'install', f.source, '--path', 'review')).code).toBe(0);
  expect((await cli(f.home, f.project, 'install', f.source, '--path', 'review', '--global')).code).toBe(0);
  const deleted = join(f.root, 'deleted'); await mkdir(deleted);
  await cli(f.home, deleted, 'init'); await rm(deleted, { recursive: true });
  await skill(f.source, 'review', 'Second'); await git(f.source, 'add', '.'); await git(f.source, 'commit', '-m', 'second');
  expect((await cli(f.home, f.project, 'update', '--check')).code).toBe(0);
  expect((await json(join(f.home, 'installations.json'))).installations).toContain(deleted);
  expect((await cli(f.home, f.project, 'update')).code).toBe(0);
  expect((await json(join(f.home, 'installations.json'))).installations).not.toContain(deleted);
  expect(await readFile(join(f.home, 'global', '.agents', 'skills', 'review', 'SKILL.md'), 'utf8')).toContain('Second');
  await cli(f.home, f.project, 'pin', 'review');
  await skill(f.source, 'review', 'Third'); await git(f.source, 'add', '.'); await git(f.source, 'commit', '-m', 'third');
  await cli(f.home, f.project, 'update');
  expect(await readFile(join(f.project, '.agents', 'skills', 'review', 'SKILL.md'), 'utf8')).toContain('Second');
  await cli(f.home, f.project, 'pin', 'review', '--unpin');
  await writeFile(join(f.project, '.agents', 'skills', 'review', 'SKILL.md'), 'My modified files');
  const updated = await cli(f.home, f.project, 'update'); expect(updated.code).toBe(1); expect(updated.out).toContain('conflict');
  expect(await readFile(join(f.project, '.agents', 'skills', 'review', 'SKILL.md'), 'utf8')).toBe('My modified files');
  expect(await readFile(join(f.home, 'global', '.agents', 'skills', 'review', 'SKILL.md'), 'utf8')).toContain('Third');
});

test('discovers managed worktrees and updates them independently', async () => {
  const f = await fixture();
  await cli(f.home, f.project, 'install', f.source, '--path', 'review');
  await git(f.project, 'init'); await git(f.project, 'config', 'user.email', 'test@example.com'); await git(f.project, 'config', 'user.name', 'Test');
  await git(f.project, 'add', '.'); await git(f.project, 'commit', '-m', 'skills');
  const worktree = join(f.root, 'feature'); await git(f.project, 'worktree', 'add', '-b', 'feature', worktree);
  await skill(f.source, 'review', 'Updated'); await git(f.source, 'add', '.'); await git(f.source, 'commit', '-m', 'update');
  const result = await cli(f.home, f.project, 'update'); expect(result.code).toBe(0);
  expect(await readFile(join(worktree, '.agents', 'skills', 'review', 'SKILL.md'), 'utf8')).toContain('Updated');
  expect((await json(join(f.home, 'installations.json'))).installations).toContain(worktree);
});

test('groups install and promote actual local edits with original pin/provenance', async () => {
  const f = await fixture();
  await cli(f.home, f.source, 'init'); await cli(f.home, f.source, 'group', 'create', 'engineering'); await cli(f.home, f.source, 'group', 'add', 'engineering', './review');
  const installed = await cli(f.home, f.project, 'install', f.source, '--group', 'engineering', '--into', 'engineering', '--pin');
  expect(installed.code).toBe(0);
  const file = join(f.project, '.agents', 'skills', 'review', 'SKILL.md'); await writeFile(file, (await readFile(file, 'utf8')).replace('First', 'Local edit'));
  const promoted = await cli(f.home, f.project, 'promote', 'engineering', '--global'); expect(promoted).toMatchObject({ code: 0 });
  const lock = await json(join(f.home, 'global', 'skills.lock.json')); expect(lock.skills.review.pinned).toBe(true); expect(lock.skills.review.source.location).toBe(f.source);
  expect(await readFile(join(f.home, 'global', '.agents', 'skills', 'review', 'SKILL.md'), 'utf8')).toContain('Local edit');
  expect((await cli(f.home, f.project, 'status', '--global', '--json')).out).toContain('modified');
});

test('rejects ambiguous collections, path escapes, symlinks and broken references', async () => {
  const f = await fixture(); await skill(f.source, 'testing', 'Testing');
  const ambiguous = await cli(f.home, f.project, 'install', f.source); expect(ambiguous.code).toBe(1); expect(ambiguous.err).toContain('Multiple skills');
  expect((await cli(f.home, f.project, 'install', f.source, '--path', '../application')).code).toBe(1);
  await writeFile(join(f.source, 'review', 'SKILL.md'), '---\nname: review\ndescription: Test\n---\n[Missing](references/missing.md)\n');
  expect((await cli(f.home, f.project, 'install', f.source, '--path', 'review')).err).toContain('Missing skill reference');
});

test('pin at install can be undone and Git-backed subdirectory exact sync restores missing files', async () => {
  const f = await fixture();
  expect((await cli(f.home, f.project, 'install', join(f.source, 'review'), '--pin')).code).toBe(0);
  const lock = await json(join(f.project, 'skills.lock.json')); expect(lock.skills.review.source.location).toBe(f.source); expect(lock.skills.review.sourcePath).toBe('review');
  await rm(join(f.project, '.agents', 'skills', 'review'), { recursive: true });
  expect((await cli(f.home, f.project, 'sync')).code).toBe(0);
  await cli(f.home, f.project, 'pin', 'review', '--unpin');
  await skill(f.source, 'review', 'After unpin'); await git(f.source, 'add', '.'); await git(f.source, 'commit', '-m', 'update');
  expect((await cli(f.home, f.project, 'update')).code).toBe(0);
  expect(await readFile(join(f.project, '.agents', 'skills', 'review', 'SKILL.md'), 'utf8')).toContain('After unpin');
});

test('existing client skill directories get local bridges; collisions fail before concrete writes', async () => {
  const f = await fixture(); await mkdir(join(f.project, '.claude', 'skills'), { recursive: true });
  await writeFile(join(f.project, '.claude', 'skills', 'personal.md'), 'Owned by user');
  expect((await cli(f.home, f.project, 'install', f.source, '--path', 'review')).code).toBe(0);
  expect(await readFile(join(f.project, '.claude', 'skills', 'review', 'SKILL.md'), 'utf8')).toContain('First');
  await skill(f.source, 'testing', 'Testing'); await mkdir(join(f.project, '.claude', 'skills', 'testing'));
  await writeFile(join(f.project, '.claude', 'skills', 'testing', 'SKILL.md'), 'User owned');
  expect((await cli(f.home, f.project, 'install', f.source, '--path', 'testing')).code).toBe(1);
  expect(await Bun.file(join(f.project, '.agents', 'skills', 'testing', 'SKILL.md')).exists()).toBe(false);
});

test('malicious lock destinations cannot remove repository-owned files', async () => {
  const f = await fixture(); await cli(f.home, f.project, 'install', f.source, '--path', 'review');
  const lockPath = join(f.project, 'skills.lock.json'), lock = await json(lockPath);
  lock.skills.review.destination = '.'; await writeFile(lockPath, JSON.stringify(lock));
  expect((await cli(f.home, f.project, 'remove', 'review')).err).toContain('Invalid managed destination');
  expect(await Bun.file(join(f.project, 'skills.json')).exists()).toBe(true);
});

test('standalone Markdown outside Git updates without treating file as directory', async () => {
  const f = await fixture(), file = join(f.root, 'standalone.md');
  await writeFile(file, '---\nname: standalone\ndescription: Test skill\n---\nFirst\n');
  expect((await cli(f.home, f.project, 'install', file)).code).toBe(0);
  await writeFile(file, '---\nname: standalone\ndescription: Test skill\n---\nSecond\n');
  expect((await cli(f.home, f.project, 'update')).code).toBe(0);
  expect(await readFile(join(f.project, '.agents', 'skills', 'standalone', 'SKILL.md'), 'utf8')).toContain('Second');
});

test('source group membership updates and overlaps retain other imported skills', async () => {
  const f = await fixture();
  await cli(f.home, f.source, 'init'); await cli(f.home, f.source, 'group', 'add', 'engineering', 'review');
  await git(f.source, 'add', '.'); await git(f.source, 'commit', '-m', 'group');
  expect((await cli(f.home, f.project, 'install', f.source, '--group', 'engineering')).code).toBe(0);
  expect((await json(join(f.project, 'skills.json'))).imports[0].group).toBe('engineering');
  await skill(f.source, 'testing', 'Test'); await cli(f.home, f.source, 'group', 'add', 'engineering', 'testing');
  await git(f.source, 'add', '.'); await git(f.source, 'commit', '-m', 'more members');
  expect((await cli(f.home, f.project, 'update')).code).toBe(0);
  expect(await Bun.file(join(f.project, '.agents', 'skills', 'testing', 'SKILL.md')).exists()).toBe(true);
  expect((await cli(f.home, f.project, 'install', f.source, '--path', 'review')).code).toBe(0);
  const config = await json(join(f.project, 'skills.json')); expect(config.imports.some((i: any) => i.names.includes('testing'))).toBe(true);
});

test('global installation exposes skill files in actual user discovery locations', async () => {
  const f = await fixture(), userHome = join(f.root, 'user'); await mkdir(userHome);
  const env: Record<string, string | undefined> = { ...process.env, HOME: userHome, USERPROFILE: userHome, XDG_CONFIG_HOME: join(userHome, '.config') }; delete env.SCTL_HOME;
  const child = Bun.spawn([process.execPath, join(import.meta.dir, '..', 'src', 'cli.ts'), 'install', f.source, '--path', 'review', '--global'], { cwd: f.project, env, stdout: 'pipe', stderr: 'pipe' });
  const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect({ code, err }).toMatchObject({ code: 0 });
  expect(await readFile(join(userHome, '.agents', 'skills', 'review', 'SKILL.md'), 'utf8')).toContain('First');
  expect(await readFile(join(userHome, '.claude', 'skills', 'review', 'SKILL.md'), 'utf8')).toContain('First');
  expect(await Bun.file(join(userHome, '.config', 'skillctl', 'global', 'skills.json')).exists()).toBe(true);
});

test('pinning a destination group alias freezes source membership until group unpin', async () => {
  const f = await fixture();
  await cli(f.home, f.source, 'init'); await cli(f.home, f.source, 'group', 'add', 'upstream', 'review');
  await cli(f.home, f.project, 'install', f.source, '--group', 'upstream', '--into', 'local');
  expect((await cli(f.home, f.project, 'pin', 'group', 'local')).code).toBe(0);
  await skill(f.source, 'testing', 'New member'); await cli(f.home, f.source, 'group', 'add', 'upstream', 'testing');
  expect((await cli(f.home, f.project, 'update')).code).toBe(0);
  expect(await Bun.file(join(f.project, '.agents', 'skills', 'testing', 'SKILL.md')).exists()).toBe(false);
  expect((await cli(f.home, f.project, 'pin', 'group', 'local', '--unpin')).code).toBe(0);
  expect((await cli(f.home, f.project, 'update')).code).toBe(0);
  expect(await Bun.file(join(f.project, '.agents', 'skills', 'testing', 'SKILL.md')).exists()).toBe(true);
});

test('ancestor filesystem aliases use canonical roots without weakening skill path boundaries', async () => {
  const f = await fixture(), alias = join(f.root, 'alias');
  await symlink(f.root, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const installed = await cli(f.home, join(alias, 'application'), 'install', join(alias, 'source', 'review'));
  expect(installed).toMatchObject({ code: 0 });
  const lock = await json(join(f.project, 'skills.lock.json'));
  expect(lock.skills.review.source.location).toBe(await realpath(f.source));
  expect(lock.skills.review.sourcePath).toBe('review');
  expect((await json(join(f.home, 'installations.json'))).installations).toContain(await realpath(f.project));
  expect((await cli(f.home, f.project, 'install', join(alias, 'source'), '--path', '../application')).code).toBe(1);
});
