import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { exists, load, save } from '../installations/state';
import { bridges, removeBridges, knownRoots, mutate, replaceSkill, safeDestination, type Result } from '../installations/manager';
import { candidate, discover } from '../sources/discover';
import { Sources } from '../sources/resolve';
import { hashPath } from '../skills/files';

export async function updateRoot(root: string, sources: Sources, check: boolean, exact = false): Promise<Result[]> {
  const run = async () => {
    if (!await exists(join(root, 'skills.json')) || !await exists(join(root, 'skills.lock.json'))) throw new Error('Registered location is no longer managed; configuration files are missing');
    const state = await load(root), results: Result[] = [];
    for (const request of state.config.imports) {
      try {
        if (request.group && request.pinned && !exact) { results.push({ root, state: 'pinned', skills: request.names }); continue; }
        // Resolve group membership afresh only when advancing, never on locked sync.
        const groupCandidates = request.group && !exact ? await discover(await sources.resolve(request.source), { group: request.group, all: true }) : undefined;
        const candidates = new Map(groupCandidates?.map(s => [s.name, s]));
        await bridges(root, groupCandidates ? groupCandidates.map(s => s.name) : request.names, true);
        const selected = groupCandidates ? [...new Set([...request.names, ...candidates.keys()])] : request.names;
        for (const n of selected) {
          const entry = state.lock.skills[n];
          try {
            if (entry && !request.names.includes(n)) { results.push({ root, state: 'conflict', skills: [n], message: 'New group member collides with another managed import' }); continue; }
            if (entry?.pinned && !exact) { results.push({ root, state: 'pinned', skills: [n] }); continue; }
            const destination = entry?.destination || `.agents/skills/${n}`, dest = await safeDestination(root, destination), local = await hashPath(dest);
            if (local && (entry ? local !== entry.installedHash : true)) { results.push({ root, state: 'conflict', skills: [n], message: 'Locally modified or unmanaged skill preserved' }); continue; }
            if (groupCandidates && !candidates.has(n)) {
              if (!check) {
                await removeBridges(root, [n]);
                await rm(dest, { recursive: true, force: true }); delete state.lock.skills[n];
                request.names = request.names.filter(x => x !== n);
                for (const [g, paths] of Object.entries(state.config.groups)) state.config.groups[g] = paths.filter(p => p !== destination);
              }
              results.push({ root, state: check ? 'removal-available' : 'removed', skills: [n] }); continue;
            }
            let skill = candidates.get(n), resolved;
            if (skill) resolved = await sources.resolve(request.source);
            else {
              if (!entry) throw new Error(`Lockfile is missing requested skill: ${n}`);
              if (exact && entry.commit === 'local') throw new Error(`Cannot restore an exact local-source snapshot: ${n}; use Git-backed sources for reproducible sync`);
              resolved = await sources.resolve(entry.source, exact ? entry.commit : undefined);
              skill = await candidate(resolved.root, entry.sourcePath, n);
            }
            if (exact && skill.hash !== entry?.installedHash) throw new Error(`Locked content hash mismatch for ${n}; source content is not reproducible`);
            const changed = local !== skill.hash;
            if (!check) await bridges(root, [n]);
            if (changed && !check) await replaceSkill(root, destination, skill);
            if (!check) {
              state.lock.skills[n] = { source: entry?.source || request.source, sourcePath: skill.path, commit: resolved.commit, destination, installedHash: skill.hash, pinned: entry?.pinned || false, originalName: entry?.originalName || n, ...(request.group ? { group: request.group } : {}) };
              if (!request.names.includes(n)) request.names.push(n);
              const localGroup = request.into || request.group;
              if (localGroup) state.config.groups[localGroup] = [...new Set([...(state.config.groups[localGroup] || []), destination])];
            }
            results.push({ root, state: changed ? check ? 'update-available' : 'updated' : 'unchanged', skills: [n] });
          } catch (error) { results.push({ root, state: 'failed', skills: [n], message: String(error instanceof Error ? error.message : error) }); }
        }
      } catch (error) { results.push({ root, state: 'failed', skills: request.names, message: String(error instanceof Error ? error.message : error) }); }
    }
    if (!check) await save(root, state.config, state.lock);
    return results.length ? results : [{ root, state: 'unchanged' }];
  };
  return check ? await run() : await mutate(root, run);
}
export async function updateAll(check: boolean): Promise<{ results: Result[]; pruned: string[] }> {
  const index = await knownRoots(check), sources = new Sources(), results: Result[] = [];
  try {
    for (const root of index.roots) {
      try { results.push(...await updateRoot(root, sources, check)); }
      catch (error) { results.push({ root, state: 'failed', message: String(error instanceof Error ? error.message : error) }); }
    }
  } finally { await sources.close(); }
  return { results, pruned: index.pruned };
}
export async function sync(root: string, check: boolean) {
  const sources = new Sources();
  try { return { results: await updateRoot(root, sources, check, true), pruned: [] }; } finally { await sources.close(); }
}
