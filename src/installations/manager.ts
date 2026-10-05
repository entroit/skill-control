import { join, resolve, dirname, relative, toNamespacedPath } from 'node:path';
import { mkdir, rm, rename, lstat, symlink, realpath, readlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { atomicJSON, exists, inside, load, name, readJSON, save, type Entry } from './state';
import { candidate, discover } from '../sources/discover';
import { git } from '../integrations/git';
import { parseSource, Sources, type Candidate } from '../sources/resolve';
import { hashPath, writeTree } from '../skills/files';

export const home = () => resolve(process.env.SCTL_HOME || join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'skillctl'));
export const globalRoot = () => join(home(), 'global');
export type Options = { global?: boolean; project?: string; path?: string; ref?: string; group?: string; into?: string; all?: boolean; name?: string; pin?: boolean; json?: boolean; dryRun?: boolean; check?: boolean; unpin?: boolean };
export type Result = { root: string; state: string; skills?: string[]; message?: string };
export async function scope(options: Options): Promise<string> {
  if (options.global && options.project) throw new Error('--global and --project cannot be combined');
  if (options.global) { await mkdir(globalRoot(), { recursive: true }); return globalRoot(); }
  const input = resolve(options.project || process.cwd());
  const cwd = await exists(input) ? await realpath(input) : input;
  const gitRoot = await git(['rev-parse', '--show-toplevel'], cwd, true);
  if (gitRoot) return await realpath(gitRoot);
  let at = cwd;
  while (true) { if (await exists(join(at, 'skills.json'))) return at; const parent = dirname(at); if (parent === at) break; at = parent; }
  return cwd;
}
async function readIndex(): Promise<string[]> {
  const path = join(home(), 'installations.json');
  if (!await exists(path)) return [];
  const data = await readJSON(path) as { version: number; installations: unknown[] };
  if (data.version !== 1 || !Array.isArray(data.installations) || data.installations.some(p => typeof p !== 'string' || !p.startsWith('/') && !/^[A-Z]:[\\/]/i.test(p))) throw new Error('Invalid installations.json');
  return data.installations as string[];
}
async function writeIndex(roots: string[]) { await atomicJSON(join(home(), 'installations.json'), { version: 1, installations: [...new Set(roots)].sort() }); }
export async function register(root: string): Promise<void> {
  await withIndexLock(async () => { await writeIndex([...(await readIndex()), await realpath(root)]); });
}
async function withIndexLock<T>(fn: () => Promise<T>): Promise<T> {
  await mkdir(home(), { recursive: true });
  return withLock(join(home(), '.index-lock'), fn);
}
async function withLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
  try { await mkdir(lockPath); } catch (e: any) { if (e.code === 'EEXIST') throw new Error(`Another sctl operation owns ${lockPath}; if it crashed, remove that lock directory`); throw e; }
  try { return await fn(); } finally { await rm(lockPath, { recursive: true, force: true }); }
}
export async function mutate<T>(root: string, fn: () => Promise<T>): Promise<T> {
  await mkdir(root, { recursive: true });
  return withLock(join(root, '.sctl-operation-lock'), fn);
}
async function safeDestination(root: string, dest: string): Promise<string> {
  const target = inside(root, dest);
  let current = root;
  for (const part of relative(root, target).split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    if (await exists(current) && (await lstat(current)).isSymbolicLink()) throw new Error(`Managed destination contains symlink: ${current}`);
  }
  return target;
}
function samePath(a: string, b: string): boolean {
  if (process.platform === 'win32') return toNamespacedPath(resolve(a)).toLowerCase() === toNamespacedPath(resolve(b)).toLowerCase();
  return resolve(a) === resolve(b);
}
function bridgeTargets(root: string, skillName: string): { link: string; target: string }[] {
  const target = join(root, '.agents', 'skills', skillName);
  const actualUserGlobal = root === globalRoot() && !process.env.SCTL_HOME;
  const discoveryRoot = actualUserGlobal ? homedir() : root;
  return (actualUserGlobal ? ['.agents', '.claude', '.codex'] : ['.claude', '.codex']).map(client => ({ link: join(discoveryRoot, client, 'skills', skillName), target }));
}
async function discoveryAttributes(root: string, names: string[], check: boolean): Promise<void> {
  const directories = new Set([join(root, '.agents', 'skills'), ...names.flatMap(n => bridgeTargets(root, n).map(b => dirname(b.link)))]);
  for (const directory of directories) {
    const path = join(directory, '.gitattributes');
    if (await exists(path)) {
      if ((await lstat(path)).isSymbolicLink()) throw new Error(`Discovery attributes cannot be a symlink: ${path}`);
      continue; // User-owned attributes are preserved, including their Git policy.
    }
    if (check) continue;
    await mkdir(directory, { recursive: true });
    const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await Bun.write(temporary, '# Keep managed skill bytes stable across Git checkouts.\n* -text\n');
    await rename(temporary, path);
  }
}
export async function bridges(root: string, names: string[], check = false): Promise<void> {
  const baseline = (await load(root)).lock.skills;
  await discoveryAttributes(root, names, true);
  for (const n of names) {
    for (const { link, target } of bridgeTargets(root, n)) {
      // Existing entire-directory bridges from older installs are accepted only if
      // they resolve to this installation's own concrete skill directory.
      if (await exists(dirname(link))) {
        if ((await lstat(dirname(link))).isSymbolicLink() && !samePath(await realpath(dirname(link)), dirname(target))) throw new Error(`Client skill directory points elsewhere: ${dirname(link)}`);
      }
      if (await exists(link)) {
        const s = await lstat(link);
        const pointsToTarget = s.isSymbolicLink() && samePath(resolve(dirname(link), await readlink(link)), target);
        if (pointsToTarget || (await exists(target) && samePath(await realpath(link), await realpath(target)))) continue;
        // Git on Windows can check a committed junction out as concrete files. Only
        // copies matching this skill's recorded baseline may become a local bridge.
        const expected = baseline[n]?.installedHash;
        if (!expected || await hashPath(link) !== expected) throw new Error(`Client discovery conflict: ${link}`);
        if (check) continue;
        const backup = `${link}.${process.pid}.${crypto.randomUUID()}.old`;
        await rename(link, backup);
        try {
          await symlink(process.platform === 'win32' ? target : relative(dirname(link), target), link, process.platform === 'win32' ? 'junction' : 'dir');
        } catch (error) { await rename(backup, link); throw error; }
        await rm(backup, { recursive: true, force: true });
        continue;
      }
      if (check) continue;
      await mkdir(dirname(link), { recursive: true });
      await symlink(process.platform === 'win32' ? target : relative(dirname(link), target), link, process.platform === 'win32' ? 'junction' : 'dir');
    }
  }
  if (!check) await discoveryAttributes(root, names, false);
}
export async function removeBridges(root: string, names: string[]): Promise<void> {
  for (const n of names) for (const { link, target } of bridgeTargets(root, n)) {
    if (await exists(link) && (await lstat(link)).isSymbolicLink() && samePath(resolve(dirname(link), await readlink(link)), target)) await rm(link);
  }
}
export async function replaceSkill(root: string, destination: string, skill: Candidate): Promise<void> {
  const dest = await safeDestination(root, destination), staging = `${dest}.${process.pid}.${crypto.randomUUID()}.new`, old = `${dest}.${process.pid}.old`;
  await writeTree(staging, skill.files);
  let backedUp = false;
  try {
    if (await exists(dest)) { await rename(dest, old); backedUp = true; }
    try { await rename(staging, dest); } catch (error) { if (backedUp) await rename(old, dest); throw error; }
    if (backedUp) await rm(old, { recursive: true, force: true });
  } finally { await rm(staging, { recursive: true, force: true }); }
}
export async function init(root: string): Promise<Result> {
  return mutate(root, async () => { const state = await load(root); await save(root, state.config, state.lock); await register(root); return { root, state: 'initialized' }; });
}
export async function install(root: string, input: string, options: Options): Promise<Result> {
  const sources = new Sources();
  try {
    return await mutate(root, async () => {
      const state = await load(root), source = parseSource(input, { ...(options.path ? { path: options.path } : {}), ...(options.ref ? { ref: options.ref } : {}) }, globalRoot());
      if (source.location.startsWith('/') || /^[A-Z]:[\\/]/i.test(source.location)) {
        const sourceStat = await lstat(source.location);
        if (sourceStat.isSymbolicLink()) throw new Error('Source root cannot be a symlink');
        source.location = await realpath(source.location);
        const reportedRoot = await git(['rev-parse', '--show-toplevel'], sourceStat.isDirectory() ? source.location : dirname(source.location), true);
        const gitRoot = reportedRoot ? await realpath(reportedRoot) : '';
        if (gitRoot && gitRoot !== source.location) {
          source.path = source.path ? relative(gitRoot, join(source.location, source.path)).replaceAll('\\', '/') : relative(gitRoot, source.location).replaceAll('\\', '/');
          source.location = gitRoot;
        } else if (!gitRoot && sourceStat.isFile()) {
          source.path = source.path || relative(dirname(source.location), source.location).replaceAll('\\', '/');
          source.location = dirname(source.location);
        }
      }
      const resolved = await sources.resolve(source), skills = await discover(resolved, { group: options.group, all: options.all, alias: options.name });
      if (options.into) name(options.into);
      await bridges(root, skills.map(s => s.name), true);
      const upstreamState = await exists(join(resolved.root, 'skills.lock.json')) && await exists(join(resolved.root, 'skills.json')) ? await load(resolved.root) : undefined;
      const transferLocal = skills.length > 0 && !!upstreamState && (source.location.startsWith('/') || /^[A-Z]:[\\/]/i.test(source.location)) && skills.every(skill => upstreamState.lock.skills[skill.name]?.destination === skill.path);
      const plans: { skill: Candidate; entry: Entry }[] = [];
      const unique = new Set<string>();
      for (const skill of skills) {
        if (unique.has(skill.name)) throw new Error(`Duplicate skill name: ${skill.name}`); unique.add(skill.name);
        const destination = `.agents/skills/${skill.name}`, current = state.lock.skills[skill.name], dest = await safeDestination(root, destination), localHash = await hashPath(dest);
        if (localHash && (!current || localHash !== current.installedHash) && localHash !== skill.hash) throw new Error(`Destination has unmanaged or modified files: ${skill.name}`);
        // Importing installed local groups preserves original provenance and baseline.
        const inherited = upstreamState?.lock.skills[skill.name];
        const localInput = source.location.startsWith('/') || /^[A-Z]:[\\/]/i.test(source.location);
        const entry: Entry = inherited && localInput && transferLocal ? { ...inherited, destination, pinned: options.pin ?? inherited.pinned } : {
          source: { ...source, ref: source.ref || (resolved.commit !== 'local' ? 'HEAD' : undefined) },
          sourcePath: skill.path, commit: resolved.commit, destination, installedHash: skill.hash,
          pinned: options.pin || false, group: options.group, originalName: options.name ? (await candidate(resolved.root, skill.path)).name : skill.name,
        };
        plans.push({ skill, entry });
      }
      if (options.dryRun) return { root, state: 'planned', skills: skills.map(s => s.name) };
      await bridges(root, plans.map(p => p.skill.name));
      for (const { skill, entry } of plans) { await replaceSkill(root, entry.destination, skill); state.lock.skills[skill.name] = entry; }
      // Every install records a request. Local promotion inherits per-skill provenance,
      // rather than tracking an accidental workstation path after publication.
      if (transferLocal) {
        // A complete transfer replaces the previous group request. Keeping an
        // empty request would rediscover its members and collide with the inherited
        // per-skill imports on the next update. Unrelated empty groups still track
        // future source membership.
        state.config.imports = state.config.imports.filter(i => !i.names.length || !i.names.every(n => unique.has(n)));
        for (const { skill, entry } of plans) {
          state.config.imports = state.config.imports.map(i => ({ ...i, names: i.names.filter(n => n !== skill.name) })).filter(i => i.names.length || i.group);
          state.config.imports.push({ source: entry.source, names: [skill.name], pinned: entry.pinned, into: options.into });
        }
      } else {
        state.config.imports = state.config.imports.map(i => ({ ...i, names: i.names.filter(n => !unique.has(n)) })).filter(i => i.names.length || i.group);
        state.config.imports.push({ source, names: skills.map(s => s.name), ...(options.group ? { group: options.group } : {}), ...(options.into ? { into: options.into } : {}), pinned: options.pin || false });
      }
      const localGroup = options.into || options.group;
      if (localGroup) state.config.groups[localGroup] = [...new Set([...(state.config.groups[localGroup] || []), ...plans.map(p => p.entry.destination)])];
      await bridges(root, plans.map(p => p.skill.name)); await save(root, state.config, state.lock); await register(root);
      return { root, state: 'installed', skills: skills.map(s => s.name) };
    });
  } finally { await sources.close(); }
}
export async function pin(root: string, selector: string, options: Options): Promise<Result> {
  name(selector);
  return mutate(root, async () => {
    const state = await load(root), names = options.group ? [...new Set([...state.config.imports.filter(i => (i.into || i.group) === selector).flatMap(i => i.names), ...(state.config.groups[selector] || []).map(p => Object.entries(state.lock.skills).find(([, e]) => e.destination === p)?.[0]).filter((n): n is string => !!n)])] : [selector];
    const matchingRequests = options.group ? state.config.imports.filter(i => (i.into || i.group) === selector) : [];
    if (!names.length && !matchingRequests.length) throw new Error(`Unknown imported group: ${selector}`);
    for (const n of names) { if (!state.lock.skills[n]) throw new Error(`Unknown managed skill: ${n}`); }
    if (options.unpin && !options.group && state.config.imports.some(i => (i.into || i.group) && i.pinned && i.names.includes(selector))) throw new Error('Unpin the containing group before unpinning this skill');
    for (const n of names) state.lock.skills[n]!.pinned = !options.unpin;
    if (!options.group) for (const i of state.config.imports.filter(i => !i.group && i.names.every(n => names.includes(n)))) i.pinned = !options.unpin;
    if (options.group) for (const i of state.config.imports.filter(i => (i.into || i.group) === selector)) i.pinned = !options.unpin;
    await save(root, state.config, state.lock); return { root, state: options.unpin ? 'unpinned' : 'pinned', skills: names };
  });
}
export async function remove(root: string, selector: string, options: Options): Promise<Result> {
  name(selector);
  return mutate(root, async () => {
    const state = await load(root), names = options.group ? [...new Set([...state.config.imports.filter(i => (i.into || i.group) === selector).flatMap(i => i.names), ...(state.config.groups[selector] || []).map(p => Object.entries(state.lock.skills).find(([, e]) => e.destination === p)?.[0]).filter((n): n is string => !!n)])] : [selector];
    const matchingRequests = options.group ? state.config.imports.filter(i => (i.into || i.group) === selector) : [];
    if (!names.length && !matchingRequests.length) throw new Error(`Unknown imported group: ${selector}`);
    for (const n of names) {
      const e = state.lock.skills[n]; if (!e) throw new Error(`Unknown managed skill: ${n}`);
      const h = await hashPath(await safeDestination(root, e.destination));
      if (h && h !== e.installedHash) throw new Error(`Locally modified skill preserved: ${n}`);
    }
    await removeBridges(root, names);
    for (const n of names) {
      const e = state.lock.skills[n]!; await rm(await safeDestination(root, e.destination), { recursive: true, force: true }); delete state.lock.skills[n];
      for (const [g, paths] of Object.entries(state.config.groups)) state.config.groups[g] = paths.filter(p => p !== e.destination);
    }
    state.config.imports = state.config.imports.map(i => ({ ...i, names: i.names.filter(n => !names.includes(n)) })).filter(i => i.names.length || i.group);
    if (options.group) {
      state.config.imports = state.config.imports.filter(i => !matchingRequests.includes(i) && (i.into || i.group) !== selector);
      delete state.config.groups[selector];
    }
    await save(root, state.config, state.lock); return { root, state: 'removed', skills: names };
  });
}
export async function status(root: string) {
  const state = await load(root);
  const skills = [];
  for (const [n, e] of Object.entries(state.lock.skills)) {
    const current = await hashPath(await safeDestination(root, e.destination));
    skills.push({ name: n, ...e, path: join(root, e.destination), state: current === undefined ? 'missing' : current === e.installedHash ? 'clean' : 'modified' });
  }
  return { root, imports: state.config.imports, groups: state.config.groups, skills };
}
export async function knownRoots(check: boolean): Promise<{ roots: string[]; pruned: string[] }> {
  return withIndexLock(async () => {
    const registered = await readIndex(), roots = new Set<string>(), pruned: string[] = [];
    if (await exists(join(globalRoot(), 'skills.json'))) registered.push(globalRoot());
    for (const root of [...new Set(registered)]) {
      try {
        if (!await exists(root)) { pruned.push(root); continue; }
        roots.add(await realpath(root));
        const worktrees = await git(['worktree', 'list', '--porcelain', '-z'], root, true);
        for (const item of worktrees.split('\0')) {
          if (!item.startsWith('worktree ')) continue;
          const path = item.slice(9);
          if (await exists(join(path, 'skills.json'))) roots.add(await realpath(path));
        }
      } catch { roots.add(root); }
    }
    if (!check) await writeIndex([...roots]);
    return { roots: [...roots].sort(), pruned };
  });
}
export { safeDestination };
