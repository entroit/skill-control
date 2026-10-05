import { relative, resolve } from 'node:path';
import { load, name, save } from '../installations/state';
import { mutate, register, type Result } from '../installations/manager';
import { candidate } from '../sources/discover';

export async function group(root: string, action: string, groupName: string, paths: string[]): Promise<Result> {
  name(groupName);
  return mutate(root, async () => {
    const state = await load(root);
    if (action === 'create') {
      if (state.config.groups[groupName]) throw new Error(`Group already exists: ${groupName}`);
      state.config.groups[groupName] = [];
    } else if (action === 'add') {
      if (!paths.length) throw new Error('group add requires skill directory paths');
      const valid: string[] = [];
      for (const p of paths) {
        const rel = relative(root, resolve(root, p)).replaceAll('\\', '/'); await candidate(root, rel); valid.push(rel);
      }
      state.config.groups[groupName] = [...new Set([...(state.config.groups[groupName] || []), ...valid])];
    } else throw new Error('Use group create NAME or group add NAME PATH...');
    await save(root, state.config, state.lock); await register(root);
    return { root, state: 'group-updated', skills: state.config.groups[groupName] };
  });
}
