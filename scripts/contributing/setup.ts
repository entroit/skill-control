import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '../..');
const current = Bun.spawn(['git', 'config', '--local', '--get', 'core.hooksPath'], {
  cwd: root, stdout: 'pipe', stderr: 'inherit',
});
const configured = (await new Response(current.stdout).text()).trim();
const status = await current.exited;
if (status !== 0 && status !== 1) throw new Error('Could not read the Git hooks configuration');
if (configured && configured !== '.githooks') {
  throw new Error(`Existing core.hooksPath is ${configured}. Add the main-branch guard to your hooks before changing this setting.`);
}
const install = Bun.spawn(['git', 'config', '--local', 'core.hooksPath', '.githooks'], {
  cwd: root, stdout: 'inherit', stderr: 'inherit',
});
if (await install.exited !== 0) throw new Error('Could not configure Git hooks');
console.log('Enabled the local main-branch commit guard. GitHub enforces pull requests for main.');
