import { join, relative, resolve } from 'node:path';
import { chmod, lstat, mkdir, readFile, readdir } from 'node:fs/promises';
import { inside, exists } from '../installations/state';

// Reject symlinks anywhere in imported trees. This avoids exporting external files and
// keeps hashes, copies, and removal operations scoped to the selected skill.
export async function assertSafePath(root: string, value: string): Promise<string> {
  const target = inside(root, value);
  let p = resolve(root);
  for (const part of relative(root, target).split(/[\\/]/).filter(Boolean)) {
    p = join(p, part);
    const s = await lstat(p);
    if (s.isSymbolicLink()) throw new Error(`Symlinks are not allowed in skill paths: ${value}`);
  }
  return target;
}
export async function tree(path: string): Promise<{ path: string; bytes: Uint8Array; mode: number }[]> {
  const files: { path: string; bytes: Uint8Array; mode: number }[] = [];
  async function walk(dir: string, prefix: string) {
    for (const entry of (await readdir(dir)).sort()) {
      if (entry === '.git') continue;
      const full = join(dir, entry), rel = prefix ? `${prefix}/${entry}` : entry, stat = await lstat(full);
      if (stat.isSymbolicLink()) throw new Error(`Symlinks are not allowed in skills: ${rel}`);
      if (stat.isDirectory()) await walk(full, rel);
      else if (stat.isFile()) files.push({ path: rel, bytes: new Uint8Array(await readFile(full)), mode: stat.mode & 0o111 ? 0o755 : 0o644 });
      else throw new Error(`Unsupported file: ${rel}`);
    }
  }
  await walk(path, '');
  return files;
}
export function hash(files: Awaited<ReturnType<typeof tree>>): string {
  const h = new Bun.CryptoHasher('sha256');
  for (const f of files) { h.update(`${f.path}\0${f.mode}\0${f.bytes.byteLength}\0`); h.update(f.bytes); }
  return `sha256:${h.digest('hex')}`;
}
export async function hashPath(path: string): Promise<string | undefined> { return await exists(path) ? hash(await tree(path)) : undefined; }
export async function writeTree(path: string, files: Awaited<ReturnType<typeof tree>>): Promise<void> {
  await mkdir(path, { recursive: true });
  for (const f of files) {
    const dest = inside(path, f.path);
    await mkdir(resolve(dest, '..'), { recursive: true });
    await Bun.write(dest, f.bytes);
    await chmod(dest, f.mode);
  }
}
