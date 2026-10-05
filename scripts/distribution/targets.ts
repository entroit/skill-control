export const targets = {
  'linux-x64-glibc': { bun: 'bun-linux-x64', os: 'linux', cpu: 'x64', libc: 'glibc' },
  'linux-arm64-glibc': { bun: 'bun-linux-arm64', os: 'linux', cpu: 'arm64', libc: 'glibc' },
  'linux-x64-musl': { bun: 'bun-linux-x64-musl', os: 'linux', cpu: 'x64', libc: 'musl' },
  'linux-arm64-musl': { bun: 'bun-linux-arm64-musl', os: 'linux', cpu: 'arm64', libc: 'musl' },
  'darwin-x64': { bun: 'bun-darwin-x64', os: 'darwin', cpu: 'x64' },
  'darwin-arm64': { bun: 'bun-darwin-arm64', os: 'darwin', cpu: 'arm64' },
  'win32-x64': { bun: 'bun-windows-x64', os: 'win32', cpu: 'x64' },
  'win32-arm64': { bun: 'bun-windows-arm64', os: 'win32', cpu: 'arm64' },
} as const;
export type Target = keyof typeof targets;
