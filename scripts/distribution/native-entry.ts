import { run } from '../../src/cli';

// Native executables are always process entry points. Bun.build on Windows can
// report import.meta.main=false, so do not gate compiled startup on that flag.
process.exitCode = await run();
