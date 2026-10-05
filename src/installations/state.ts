import { resolve, relative, isAbsolute, join } from 'node:path';
import { mkdir, rename, lstat } from 'node:fs/promises';

export type Source = { location: string; path?: string; ref?: string };
export type Import = { source: Source; names: string[]; group?: string; into?: string; pinned?: boolean };
export type Config = { version: 1; imports: Import[]; groups: Record<string, string[]> };
export type Entry = { source: Source; sourcePath: string; commit: string; destination: string; installedHash: string; pinned: boolean; group?: string; originalName: string };
export type Lock = { version: 1; skills: Record<string, Entry> };
export const emptyConfig = (): Config => ({ version: 1, imports: [], groups: {} });
export const emptyLock = (): Lock => ({ version: 1, skills: {} });
export function name(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value) || value === '.' || value === '..') throw new Error(`Invalid skill or group name: ${value}`);
  return value;
}
export function inside(root: string, value: string): string {
  if (isAbsolute(value)) throw new Error(`Expected a relative path: ${value}`);
  const target = resolve(root, value), rel = relative(root, target);
  if (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) throw new Error(`Path escapes source: ${value}`);
  return target;
}
export async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error: any) { if (error.code === 'ENOENT') return false; throw error; }
}
export async function atomicJSON(path: string, data: unknown): Promise<void> {
  await mkdir(resolve(path, '..'), { recursive: true });
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await Bun.write(temporary, `${JSON.stringify(data, null, 2)}\n`);
  await rename(temporary, path);
}
export async function readJSON(path: string): Promise<unknown> {
  if ((await lstat(path)).isSymbolicLink()) throw new Error(`Configuration cannot be a symlink: ${path}`);
  return JSON.parse(await Bun.file(path).text());
}
export function config(data: unknown): Config {
  const c = data as Config;
  if (!c || c.version !== 1 || !Array.isArray(c.imports) || !c.groups || typeof c.groups !== 'object' || Array.isArray(c.groups)) throw new Error('Invalid skills.json');
  for (const [key, paths] of Object.entries(c.groups)) { name(key); if (!Array.isArray(paths) || paths.some(p => typeof p !== 'string')) throw new Error(`Invalid group: ${key}`); }
  for (const i of c.imports) {
    if (!i || !i.source || typeof i.source.location !== 'string' || !Array.isArray(i.names) || i.names.some(n => typeof n !== 'string')) throw new Error('Invalid import');
    i.names.forEach(name);
    if (i.source.path !== undefined && typeof i.source.path !== 'string') throw new Error('Invalid source path');
    if (i.source.ref !== undefined && typeof i.source.ref !== 'string') throw new Error('Invalid source revision');
    if (i.pinned !== undefined && typeof i.pinned !== 'boolean') throw new Error('Invalid import pin');
    if (i.source.path !== undefined) inside('/sctl-validation', i.source.path);
    if (i.group !== undefined) name(i.group);
    if (i.into !== undefined) name(i.into);
  }
  return c;
}
export function lock(data: unknown): Lock {
  const l = data as Lock;
  if (!l || l.version !== 1 || !l.skills || typeof l.skills !== 'object' || Array.isArray(l.skills)) throw new Error('Invalid skills.lock.json');
  for (const [key, e] of Object.entries(l.skills)) {
    name(key);
    if (!e || typeof e.destination !== 'string' || typeof e.installedHash !== 'string' || typeof e.commit !== 'string' || typeof e.sourcePath !== 'string' || !e.source || typeof e.source.location !== 'string' || typeof e.originalName !== 'string' || typeof e.pinned !== 'boolean') throw new Error(`Invalid locked skill: ${key}`);
    name(e.originalName);
    if (e.destination !== `.agents/skills/${key}`) throw new Error(`Invalid managed destination for ${key}`);
    if (e.source.path !== undefined && typeof e.source.path !== 'string') throw new Error(`Invalid source path: ${key}`);
    if (e.source.ref !== undefined && typeof e.source.ref !== 'string') throw new Error(`Invalid source revision: ${key}`);
    if (e.source.path !== undefined) inside('/sctl-validation', e.source.path);
    inside('/sctl-validation', e.sourcePath);
    if (!/^sha256:[a-f0-9]{64}$/.test(e.installedHash)) throw new Error(`Invalid content hash: ${key}`);
    if (e.commit !== 'local' && !/^[a-f0-9]{40,64}$/.test(e.commit)) throw new Error(`Invalid locked revision: ${key}`);
    if (e.group !== undefined) name(e.group);
  }
  return l;
}
export async function load(root: string): Promise<{ config: Config; lock: Lock }> {
  const cp = join(root, 'skills.json'), lp = join(root, 'skills.lock.json');
  if (!await exists(cp) && !await exists(lp)) return { config: emptyConfig(), lock: emptyLock() };
  if (!await exists(cp) || !await exists(lp)) throw new Error('Both skills.json and skills.lock.json are required');
  return { config: config(await readJSON(cp)), lock: lock(await readJSON(lp)) };
}
export async function save(root: string, c: Config, l: Lock): Promise<void> {
  await atomicJSON(join(root, 'skills.json'), c);
  await atomicJSON(join(root, 'skills.lock.json'), l);
}
