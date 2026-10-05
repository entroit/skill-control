'use strict';

function platformKey(platform = process.platform, arch = process.arch, report = undefined) {
  if (!['x64', 'arm64'].includes(arch) || !['linux', 'darwin', 'win32'].includes(platform)) {
    throw new Error(`Unsupported platform: ${platform}/${arch}`);
  }
  if (platform === 'linux') {
    const header = (report ?? process.report?.getReport())?.header;
    if (!header) throw new Error('Cannot determine Linux libc from Node process.report');
    return `linux-${arch}-${header.glibcVersionRuntime ? 'glibc' : 'musl'}`;
  }
  return `${platform}-${arch}`;
}

module.exports = { platformKey };
