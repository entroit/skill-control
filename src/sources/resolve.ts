import { dirname, join, resolve } from 'node:path';
import { lstat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { type Source } from '../installations/state';
import { type tree } from '../skills/files';
import { git } from '../integrations/git';

export function parseSource(input: string, options: { path?: string; ref?: string }, globalRoot: string): Source {
  if (input === '@global') return { location: globalRoot, ...options };
  if (input.startsWith('https://github.com/') || input.startsWith('http://github.com/')) {
    const url = new URL(input);
    if (url.username || url.password) throw new Error('Use Git authentication instead of credentials embedded in a source URL');
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts.length < 2) throw new Error('Expected a Git repository URL');
    const source: Source = { location: `https://github.com/${parts[0]}/${parts[1]!.replace(/\.git$/, '')}.git` };
    if (parts[2] === 'tree' || parts[2] === 'blob') {
      if (!parts[3]) throw new Error('Missing Git revision in source URL');
      source.ref = parts[3]; source.path = parts.slice(4).join('/');
    } else if (parts.length > 2) throw new Error('Unsupported GitHub URL; use a repository, tree, or blob URL');
    return { ...source, ...options };
  }
  if (/^https?:\/\//.test(input)) { const url = new URL(input); if (url.username || url.password) throw new Error('Use Git authentication instead of credentials embedded in a source URL'); }
  if (/^(https?:\/\/|ssh:\/\/|git:\/\/|[^@\s]+@[^:\s]+:)/.test(input)) return { location: input, ...options };
  return { location: resolve(input), ...options };
}
export type Resolved = { root: string; commit: string; source: Source };
export type Candidate = { name: string; path: string; files: Awaited<ReturnType<typeof tree>>; hash: string };
export class Sources {
  private cache = new Map<string, Promise<Resolved>>();
  private temporary: string[] = [];
  async resolve(source: Source, exact?: string): Promise<Resolved> {
    const key = JSON.stringify([source.location, exact || source.ref || 'HEAD']);
    let result = this.cache.get(key);
    if (!result) { result = this.fetch(source, exact); this.cache.set(key, result); }
    const resolved = await result;
    return { ...resolved, source };
  }
  private async fetch(source: Source, exact?: string): Promise<Resolved> {
    if (!/^(https?:\/\/|ssh:\/\/|git:\/\/|[^@\s]+@[^:\s]+:)/.test(source.location)) {
      const stat = await lstat(source.location);
      if (stat.isSymbolicLink()) throw new Error('Source root cannot be a symlink');
      const root = stat.isDirectory() ? source.location : dirname(source.location);
      const repo = await git(['rev-parse', '--show-toplevel'], root, true);
      if (!exact && (!source.ref || source.ref === 'HEAD') && repo === '') return { root: source.location, commit: 'local', source };
      // Importing a checkout uses its current files, including edits. Updates follow
      // its configured ref through a detached temporary clone.
      if (!exact && !source.ref) return { root: source.location, commit: await git(['rev-parse', 'HEAD'], root, true) || 'local', source };
    }
    const dest = await mkdtemp(join(tmpdir(), 'sctl-source-')); this.temporary.push(dest);
    await git(['clone', '--no-checkout', '--', source.location, dest]);
    let revision = exact || source.ref;
    if (!revision) revision = await git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], dest);
    if (!revision || revision.startsWith('-') || /[\x00-\x20]/.test(revision)) throw new Error('Invalid Git revision');
    const commit = await git(['rev-parse', '--verify', `${revision}^{commit}`], dest);
    await git(['checkout', '--detach', commit], dest);
    return { root: dest, commit, source: { ...source, ref: source.ref || revision.replace(/^origin\//, '') } };
  }
  async close() { await Promise.all(this.temporary.map(p => rm(p, { recursive: true, force: true }))); }
}
