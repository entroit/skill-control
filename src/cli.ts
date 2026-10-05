import managementSkill from '../skills/skill-control/SKILL.md' with { type: 'text' };
import { version } from '../package.json';
import { init, install, pin, remove, scope, status, type Options } from './installations/manager';
import { group } from './groups/manage';
import { sync, updateAll } from './updates/update';
import { bold, cyan, dim, fail, report } from './report';

const section = (title: string, rows: [string, string][]) => {
  const width = Math.max(...rows.map(([left]) => left.length));
  return `${bold(title)}\n${rows.map(([left, right]) => `  ${(left.startsWith('sctl') ? cyan : String)(right ? left.padEnd(width) : left)}${right ? `  ${right}` : ''}`).join('\n')}`;
};
const help = () => [
  `${bold('sctl')} ${dim('installs agent skills from Git and keeps them up to date.')}`,
  section('Use skills', [
    ['sctl install <source> [skill...]', 'Add skills to this project'],
    ['sctl update [--check]', 'Pull source changes into every installation'],
    ['sctl status', 'Show sources, pins, and local edits'],
    ['sctl pin <skill> [--unpin]', 'Hold a skill at its current version'],
    ['sctl remove <skill>', 'Delete a managed skill'],
    ['sctl sync [--check]', 'Restore the versions in skills-lock.json'],
  ]),
  section('Sources', [
    ['owner/repo', 'GitHub repository'],
    ['owner/repo/path/to/skill', 'One skill in a GitHub repository'],
    ['https://github.com/...', 'GitHub repository, tree, or blob URL'],
    ['git@host:org/repo.git', 'Any Git URL'],
    ['./path/to/skill', 'Local directory or Markdown file'],
    ['@global', 'Your global installation'],
  ]),
  section('Install options', [
    ['--all', 'Install every skill in the source'],
    ['--group <name>', 'Install a group from a skill repository'],
    ['--into <group>', 'Add the installed skills to a group here'],
    ['--path <path>', 'Select a directory in the source'],
    ['--ref <ref>', 'Select a branch, tag, or commit'],
    ['--name <name>', 'Install under another name'],
    ['--pin', 'Pin on install'],
  ]),
  section('Maintain a skill repository', [
    ['sctl init', 'Start managing skills here'],
    ['sctl group create <name>', 'Create an empty group'],
    ['sctl group add <name> <path...>', 'Add skills you wrote to a group'],
    ['sctl pin group <name> [--unpin]', 'Hold every skill in a group'],
    ['sctl remove group <name>', 'Delete a group and its managed skills'],
    ['sctl promote <group> --global', 'Copy a project group to your global installation'],
  ]),
  section('Everywhere', [
    ['--global', 'Target your global installation'],
    ['--project <path>', 'Target another project'],
    ['--json', 'Print machine-readable results'],
    ['sctl skill', 'Print instructions for coding agents'],
  ]),
  section('Examples', [
    ['sctl install anthropics/skills frontend-design', ''],
    ['sctl install your-org/skills --group frontend', ''],
    ['sctl update', ''],
  ]),
  dim('sctl never runs skill scripts, commits, pushes, or opens pull requests.'),
].join('\n\n');
function parse(argv: string[]): { args: string[]; options: Options } {
  const args: string[] = [], options: Record<string, unknown> = {};
  const values: Record<string, string> = { '--path': 'path', '--ref': 'ref', '--group': 'group', '--into': 'into', '--name': 'name', '--project': 'project' };
  const flags: Record<string, string> = { '--global': 'global', '--all': 'all', '--pin': 'pin', '--json': 'json', '--dry-run': 'dryRun', '--check': 'check', '--unpin': 'unpin' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--') { args.push(...argv.slice(i + 1)); break; }
    if (Object.hasOwn(values, arg)) { const value = argv[++i]; if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`); options[values[arg]!] = value; }
    else if (Object.hasOwn(flags, arg)) options[flags[arg]!] = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else args.push(arg);
  }
  return { args, options: options as Options };
}
export async function run(argv = process.argv.slice(2)): Promise<number> {
  let json = argv.includes('--json');
  try {
    if (!argv.length || argv.includes('--help') || argv[0] === 'help') { console.log(help()); return 0; }
    if (argv[0] === '--version' || argv[0] === 'version') { console.log(version); return 0; }
    const { args, options } = parse(argv); json = !!options.json;
    const command = args.shift();
    const common = ['global', 'project', 'json'];
    const allowed: Record<string, string[]> = {
      install: [...common, 'path', 'ref', 'group', 'into', 'all', 'name', 'pin', 'dryRun'],
      init: common, group: common, promote: [...common, 'dryRun'],
      pin: [...common, 'unpin'], remove: common, status: common,
      update: ['check', 'json'], sync: [...common, 'check'], skill: [],
    };
    if (!command || !Object.hasOwn(allowed, command)) throw new Error(`Unknown command: ${command}. Run sctl --help`);
    for (const option of Object.keys(options)) {
      if (!allowed[command]!.includes(option)) throw new Error(`${option} is not supported by ${command}`);
    }
    if (options.group && options.path) throw new Error('Choose --group or --path, not both');
    if (command === 'skill') { if (args.length) throw new Error('skill accepts no arguments'); console.log(managementSkill); return 0; }
    let result: unknown;
    if (command === 'update') {
      if (options.global || options.project || args.length) throw new Error('update targets all known installations; use --check to preview');
      result = { ...await updateAll(!!options.check), check: !!options.check };
    } else {
      const root = await scope(command === 'promote' ? { global: true } : options);
      switch (command) {
        case 'init': if (args.length) throw new Error('init accepts no arguments'); result = await init(root); break;
        case 'install': {
          const [source, ...skills] = args;
          if (!source) throw new Error('install requires a source, for example: sctl install owner/repo');
          if (skills.length && (options.all || options.group || options.path)) throw new Error('Name skills, or use --all, --group, or --path, not both');
          result = await install(root, source, { ...options, skills }); break;
        }
        case 'promote': {
          if (!options.global || !args[0] || args.length !== 1) throw new Error('Use promote GROUP --global');
          const source = await scope({ project: options.project });
          result = await install(root, source, { ...options, group: args[0], into: args[0] }); break;
        }
        case 'group': if (!args[0] || !args[1]) throw new Error('Use group create NAME or group add NAME PATH...'); result = await group(root, args[0], args[1], args.slice(2)); break;
        case 'pin': {
          if (args[0] === 'group') { options.group = args[1]; args.shift(); }
          if (!args[0] || args.length !== 1) throw new Error('pin requires a skill or group name'); result = await pin(root, args[0], options); break;
        }
        case 'remove': {
          if (args[0] === 'group') { options.group = args[1]; args.shift(); }
          if (!args[0] || args.length !== 1) throw new Error('remove requires a skill or group name'); result = await remove(root, args[0], options); break;
        }
        case 'status': if (args.length) throw new Error('status accepts no arguments'); result = await status(root); break;
        case 'sync': if (args.length) throw new Error('sync accepts no arguments'); result = await sync(root, !!options.check); break;
        default: throw new Error(`Unknown command: ${command}. Run sctl --help`);
      }
    }
    report(result, json);
    const results = (result as any).results as { state: string }[] | undefined;
    return results?.some(r => r.state === 'failed' || r.state === 'conflict') ? 1 : 0;
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), json);
    return 1;
  }
}
if (import.meta.main) process.exitCode = await run();
