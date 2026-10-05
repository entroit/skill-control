export async function git(args: string[], cwd?: string, optional = false): Promise<string> {
  const child = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code !== 0 && !optional) throw new Error(`Git failed: ${err.trim() || out.trim()}`);
  return code === 0 ? out.trim() : '';
}
