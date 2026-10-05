import { basename, dirname, join, resolve, relative, posix } from 'node:path';
import { lstat, readdir } from 'node:fs/promises';
import { config, exists, inside, name, readJSON } from '../installations/state';
import { assertSafePath, hash, tree } from '../skills/files';
import { type Candidate, type Resolved } from './resolve';

export async function candidate(root: string, path: string, alias?: string): Promise<Candidate> {
  const full = await assertSafePath(root, path), stat = await lstat(full);
  let files: Awaited<ReturnType<typeof tree>>, inferred: string;
  if (stat.isFile()) {
    files = [{ path: 'SKILL.md', bytes: new Uint8Array(await Bun.file(full).arrayBuffer()), mode: 0o644 }];
    inferred = basename(full) === 'SKILL.md' ? basename(dirname(full)) : basename(full).replace(/\.md$/i, '');
  } else {
    files = await tree(full); inferred = basename(full);
  }
  const skill = files.find(f => f.path === 'SKILL.md');
  if (!skill) throw new Error(`No SKILL.md in ${path}`);
  const content = new TextDecoder().decode(skill.bytes), match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`Missing YAML frontmatter: ${path}`);
  const metadata = Bun.YAML.parse(match[1]!) as { name?: unknown; description?: unknown };
  if (!metadata || typeof metadata.name !== 'string' || typeof metadata.description !== 'string' || !metadata.description.trim()) throw new Error(`Skill requires name and description: ${path}`);
  name(metadata.name); name(inferred);
  if (stat.isDirectory() && metadata.name !== inferred) throw new Error(`Skill name ${metadata.name} does not match directory ${inferred}`);
  // Bundle imports must currently be self-contained. External cross-skill links need
  // an explicit layout contract before they can be safely relocated.
  for (const file of files.filter(f => f.path.endsWith('.md'))) {
    const body = new TextDecoder().decode(file.bytes);
    for (const link of body.matchAll(/\]\((?:<)?([^\s)>]+)(?:>)?(?:[^)]*)\)/g)) {
      const target = link[1]!;
      if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(target)) continue;
      const targetPath = target.split('#')[0]!.split('?')[0]!;
      if (!targetPath) continue;
      const decoded = decodeURIComponent(targetPath);
      if (decoded.includes('\\')) throw new Error(`Use forward slashes in skill references: ${target}`);
      const logical = posix.normalize(posix.join(posix.dirname(file.path), decoded));
      if (logical === '..' || logical.startsWith('../') || logical.startsWith('..\\')) throw new Error(`Skill ${inferred} references outside its directory: ${target}. Cross-skill bundles are not yet supported.`);
      if (targetPath.startsWith('/')) throw new Error(`Skill ${inferred} contains an absolute local reference: ${target}`);
      if (!files.some(f => f.path === logical || f.path.startsWith(`${logical}/`))) throw new Error(`Missing skill reference in ${inferred}: ${target}`);
    }
  }
  if (alias && alias !== inferred) {
    name(alias);
    const renamed = content.replace(/^(name:\s*).*$/m, `$1${alias}`);
    if (renamed === content) throw new Error('Cannot rename skill: name must be a top-level YAML field');
    skill.bytes = new TextEncoder().encode(renamed);
  }
  return { name: alias ? name(alias) : inferred, path, files, hash: hash(files) };
}
export async function discover(resolved: Resolved, options: { group?: string; all?: boolean; alias?: string }): Promise<Candidate[]> {
  const root = resolved.root, stat = await lstat(root);
  if (stat.isFile()) return [await candidate(dirname(root), basename(root), options.alias)];
  const path = resolved.source.path || '.';
  if (options.group) {
    const manifest = config(await readJSON(join(root, 'skills.json'))), paths = manifest.groups[options.group];
    if (!paths) throw new Error(`Unknown source group: ${options.group}`);
    const selected = await Promise.all(paths.map(p => candidate(root, p)));
    if (new Set(selected.map(s => s.name)).size !== selected.length) throw new Error(`Source group contains duplicate skill names: ${options.group}`);
    return selected;
  }
  const selected = await assertSafePath(root, path), selectedStat = await lstat(selected);
  if (selectedStat.isFile() || await exists(join(selected, 'SKILL.md'))) return [await candidate(root, path, options.alias)];
  const found: string[] = [];
  async function walk(dir: string) {
    for (const entry of (await readdir(dir)).sort()) {
      if (entry.startsWith('.') || entry === 'node_modules') continue;
      const full = join(dir, entry), s = await lstat(full);
      if (s.isSymbolicLink()) continue;
      if (!s.isDirectory()) continue;
      if (await exists(join(full, 'SKILL.md'))) found.push(relative(root, full).replaceAll('\\', '/'));
      else await walk(full);
    }
  }
  await walk(selected);
  if (!found.length) throw new Error('No skill directories found');
  if (found.length > 1 && !options.all) throw new Error(`Multiple skills found; select --path or use --all:\n${found.join('\n')}`);
  if (options.alias && found.length > 1) throw new Error('--name requires exactly one skill');
  return await Promise.all(found.map(p => candidate(root, p, options.alias)));
}
