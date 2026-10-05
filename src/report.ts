import { homedir } from 'node:os';

const enabled = (stream: { isTTY?: boolean }) => !process.env.NO_COLOR && (!!process.env.FORCE_COLOR || !!stream.isTTY);
const paint = (code: string, stream: { isTTY?: boolean } = process.stdout) => (text: string) => enabled(stream) ? `\x1b[${code}m${text}\x1b[0m` : text;
export const bold = paint('1'), dim = paint('2'), red = paint('31'), green = paint('32'), yellow = paint('33'), cyan = paint('36');

const home = homedir();
const tidy = (path: string) => path === home ? '~' : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
const source = (location: string) => tidy(location.replace(/^https:\/\//, '').replace(/\.git$/, ''));

type Result = { root: string; state: string; skills?: string[]; message?: string };
const marks: Record<string, [string, (text: string) => string, string]> = {
  updated: ['✓', green, 'updated'],
  removed: ['✓', green, 'removed'],
  unchanged: ['·', dim, 'up to date'],
  pinned: ['=', yellow, 'pinned'],
  'update-available': ['↑', cyan, 'update available'],
  'removal-available': ['↓', cyan, 'removed upstream'],
  conflict: ['!', yellow, 'conflict'],
  failed: ['✗', red, 'failed'],
};
const verbs: Record<string, string> = { installed: 'Installed', planned: 'Would install', pinned: 'Pinned', unpinned: 'Unpinned', removed: 'Removed', initialized: 'Initialized', 'group-updated': 'Updated group' };

function results(value: { results: Result[]; pruned: string[]; check?: boolean }) {
  const roots = [...new Set(value.results.map(r => r.root))], counts = new Map<string, number>();
  for (const root of roots) {
    console.log(bold(tidy(root)));
    const rows = value.results.filter(r => r.root === root).flatMap(r => (r.skills?.length ? r.skills : ['']).map(skill => ({ ...r, skill })));
    const width = Math.max(...rows.map(r => r.skill.length));
    for (const r of rows) {
      const [mark, color, label] = marks[r.state] ?? ['·', dim, r.state];
      counts.set(label, (counts.get(label) ?? 0) + 1);
      console.log(`  ${color(mark)} ${r.skill.padEnd(width)}  ${color(label)}${r.message ? dim(`  ${r.message}`) : ''}`);
    }
  }
  if (value.pruned.length) console.log(dim(`${value.pruned.length} missing installation(s) ${value.check ? 'would be pruned' : 'pruned'}`));
  if (roots.length) console.log(`\n${[...counts].map(([label, n]) => `${n} ${label}`).join(dim(' · '))}`);
}

type Status = { root: string; groups: Record<string, string[]>; skills: { name: string; state: string; pinned: boolean; commit: string; source: { location: string; ref?: string } }[] };
function status(value: Status) {
  console.log(bold(tidy(value.root)));
  if (!value.skills.length) { console.log(dim('  No managed skills. Try: sctl install owner/repo')); return; }
  const width = Math.max(...value.skills.map(s => s.name.length));
  for (const s of value.skills) {
    const state = s.state === 'clean' ? green('clean   ') : s.state === 'modified' ? yellow('modified') : red(s.state.padEnd(8));
    const revision = s.commit === 'local' ? 'local' : `${s.source.ref && s.source.ref !== 'HEAD' ? `${s.source.ref}@` : ''}${s.commit.slice(0, 7)}`;
    console.log(`  ${s.name.padEnd(width)}  ${state}  ${dim(`${source(s.source.location)} ${revision}`)}${s.pinned ? yellow('  pinned') : ''}`);
  }
  const groups = Object.entries(value.groups);
  if (groups.length) console.log(`${dim('Groups')}  ${groups.map(([n, paths]) => `${n} ${dim(`(${paths.length})`)}`).join(', ')}`);
}

export function report(value: any, json: boolean) {
  if (json) console.log(JSON.stringify(value, null, 2));
  else if (value.results) results(value);
  else if (value.imports) status(value);
  else {
    const skills = value.skills?.length ? ` ${bold(value.skills.join(', '))}` : '';
    const where = value.root === process.cwd() ? '' : dim(` in ${tidy(value.root)}`);
    console.log(`${green('✓')} ${verbs[value.state] ?? value.state}${skills}${where}`);
  }
}

export function fail(message: string, json: boolean) {
  process.stderr.write(`${json ? JSON.stringify({ error: message }) : `${paint('31;1', process.stderr)('error')} ${message}`}\n`);
}
