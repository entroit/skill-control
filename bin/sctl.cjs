#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { platformKey } = require('./platform.cjs');

try {
  const key = platformKey();
  const packageName = `@entroit/skill-control-${key}`;
  let manifestPath;
  try { manifestPath = require.resolve(`${packageName}/package.json`); }
  catch {
    throw new Error(`Missing native package ${packageName}. Reinstall with optional dependencies enabled (do not use --omit=optional).`);
  }
  const expectedVersion = require('../package.json').version;
  const installedVersion = require(manifestPath).version;
  if (installedVersion !== expectedVersion) {
    throw new Error(`Native package ${packageName} has version ${installedVersion}; expected ${expectedVersion}. Reinstall the CLI.`);
  }
  const binary = path.join(path.dirname(manifestPath), 'bin', process.platform === 'win32' ? 'sctl.exe' : 'sctl');
  const child = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' });
  if (child.error) throw child.error;
  if (child.signal) process.kill(process.pid, child.signal);
  else process.exit(child.status ?? 1);
} catch (error) {
  console.error(`sctl: ${error.message}`);
  process.exit(1);
}
