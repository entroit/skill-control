import managementSkill from '../skills/skill-control/SKILL.md' with { type: 'text' };
import { init, install, pin, remove, scope, status, type Options } from './installations/manager';
import { group } from './groups/manage';
import { sync, updateAll } from './updates/update';

const help = `sctl — skill-control\n\n  install SOURCE [--path PATH | --group NAME | --all] [--name NAME]\n                 [--into GROUP] [--pin] [--global | --project PATH]\n  init [--global | --project PATH]\n  group create NAME | group add NAME PATH...\n  promote GROUP --global\n  pin NAME [--unpin] | pin group NAME [--unpin]\n  remove NAME | remove group NAME\n  status [--json] [--global | --project PATH]\n  update [--check] [--json]             Update every known installation\n  sync [--check] [--global | --project PATH]\n  skill                               Print agent management instructions\n\nInstall and update never execute skills, commit, push, or create PRs.\n`;
function parse(argv: string[]): { args: string[]; options: Options } {
  const args: string[] = [], options: Record<string, unknown> = {};
  const values: Record<string, string> = { '--path': 'path', '--ref': 'ref', '--group': 'group', '--into': 'into', '--name': 'name', '--project': 'project' };
  const flags: Record<string, string> = { '--global': 'global', '--all': 'all', '--pin': 'pin', '--json': 'json', '--dry-run': 'dryRun', '--check': 'check', '--unpin': 'unpin' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--') { args.push(...argv.slice(i + 1)); break; }
    if (values[arg]) { const value = argv[++i]; if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`); options[values[arg]!] = value; }
    else if (flags[arg]) options[flags[arg]!] = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else args.push(arg);
  }
  return { args, options: options as Options };
}
function print(value: unknown, json: boolean) {
  if (json) { console.log(JSON.stringify(value, null, 2)); return; }
  const object = value as any;
  if (object.results) {
    for (const r of object.results) console.log(`${r.state}: ${r.root}${r.skills?.length ? ` (${r.skills.join(', ')})` : ''}${r.message ? ` — ${r.message}` : ''}`);
    if (object.pruned?.length) console.log(`${object.pruned.length} missing installation(s) ${object.check ? 'would be pruned' : 'pruned'}`);
  } else if (object.skills && Array.isArray(object.skills) && object.skills.some((s: unknown) => typeof s === 'object')) {
    console.log(object.root); for (const s of object.skills) console.log(`${s.name}: ${s.state}${s.pinned ? ' (pinned)' : ''} — ${s.path}`);
    console.log(`Groups: ${Object.keys(object.groups).join(', ') || 'none'}`);
  } else console.log(`${object.state}: ${object.root}${object.skills?.length ? ` (${object.skills.join(', ')})` : ''}`);
}
export async function run(argv = process.argv.slice(2)): Promise<number> {
  let json = argv.includes('--json');
  try {
    if (!argv.length || argv.includes('--help') || argv[0] === 'help') { console.log(help); return 0; }
    if (argv[0] === '--version' || argv[0] === 'version') { console.log('0.1.0'); return 0; }
    const { args, options } = parse(argv); json = !!options.json;
    const command = args.shift();
    const common = ['global', 'project', 'json'];
    const allowed: Record<string, string[]> = {
      install: [...common, 'path', 'ref', 'group', 'into', 'all', 'name', 'pin', 'dryRun'],
      init: common, group: common, promote: [...common, 'dryRun'],
      pin: [...common, 'unpin'], remove: common, status: common,
      update: ['check', 'json'], sync: [...common, 'check'], skill: [],
    };
    if (command && allowed[command]) for (const option of Object.keys(options)) {
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
        case 'install': if (!args[0] || args.length !== 1) throw new Error('install requires exactly one source URL or local path'); result = await install(root, args[0], options); break;
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
    print(result, json);
    const results = (result as any).results as { state: string }[] | undefined;
    return results?.some(r => r.state === 'failed' || r.state === 'conflict') ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) console.error(JSON.stringify({ error: message })); else console.error(`sctl: ${message}`);
    return 1;
  }
}
if (import.meta.main) process.exitCode = await run();
