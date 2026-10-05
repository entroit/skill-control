# Bun runtime and distribution

## Verified release

On October 5, 2026, Bun's official [latest-release API](https://api.github.com/repos/oven-sh/bun/releases/latest) identifies [Bun 1.4.2](https://github.com/oven-sh/bun/releases/tag/bun-v1.4.2), published September 5, as the latest stable release. Development and CI pin 1.4.2. This project does not depend on a moving canary.

Read the [1.4.2 release notes](https://bun.sh/blog/bun-v1.4.2), [1.4 release](https://bun.sh/blog/bun-v1.4), and [1.4.1 release notes](https://bun.sh/blog/bun-v1.4.1) when upgrading.

## Features used

- Bun's TypeScript runtime runs development commands without a transpilation framework.
- [Bun.YAML](https://bun.sh/docs/runtime/yaml) parses skill frontmatter without a YAML dependency. The 1.4 parser passes the upstream YAML conformance suite and uses YAML 1.2 scalar rules. Validate the resulting object at the source boundary.
- [Bun.file and Bun.write](https://bun.sh/docs/runtime/file-io) read configuration, skill content, and generated artifacts. Stage writes and rename them on the destination filesystem.
- [Bun.CryptoHasher](https://bun.sh/docs/runtime/hashing) computes SHA-256 skill hashes. Hash sorted paths, bytes, and executable permissions so supporting-file changes are observable.
- [Bun.spawn](https://bun.sh/docs/runtime/child-process) runs Git with argument arrays and the caller's existing credentials. Do not interpolate source input into a shell.
- [Parallel scripts and tests](https://bun.sh/blog/bun-v1.4) run independent checks without an extra task-runner dependency. CI installs from the committed Bun lockfile.
- [Bun.build standalone executables](https://bun.sh/docs/bundler/executables) bundle the runtime and CLI for each supported platform. A dedicated native entry point invokes the command runner directly, avoiding reliance on platform-sensitive main-module detection.
- Bun 1.4 uses one x64 binary with SSE4.2 compatibility and selects newer CPU instructions at runtime. The default targets cover older x64 machines without separate baseline packages.
- Bun 1.4.1 supports cross-platform bytecode compilation and `bytecodeDepth`. Release builds precompile shallow functions to limit startup parsing while avoiding an unnecessary deep bytecode footprint.
- Text imports embed the management skill in the executable. The 1.4.1 improvements store compiled text imports once, so `sctl skill` needs no separate runtime asset lookup.

Browser, image, terminal, cron, and database APIs are available in Bun 1.4 but do not solve an installation-manager requirement. Adding them would increase maintenance without changing the supported workflow. No performance improvement is claimed without a measured comparison.

## Run through npm without installing Bun

`npx` executes a Node-compatible launcher. The launcher resolves an exact-version optional platform package and executes its compiled Bun binary. Bun's APIs remain available inside that executable even when the user's machine has only Node and Git. A JavaScript bundle targeting Node would not supply the Bun runtime APIs.

Platform packages are selected by operating system, architecture, and Linux libc. Release preparation builds npm artifacts; publication is an explicit release action. The launcher does not download or execute a remote binary at runtime and has no installation lifecycle script.

The source package stays private to prevent accidental publication without its platform dependencies. Publish only the generated packages under `dist/npm`. The publication script requires every supported target and checks their exact versions before publishing platform packages, then the launcher.

This trades a larger platform package for one runtime and a small launcher. Development, native execution, and testing use Bun. npm supplies the distribution channel.

## Upgrade Bun

Update the version pin, CI setup, and package-manager metadata together. Run type checks, behavior tests, native compilation, npm-package smoke tests, and the platform CI matrix. Re-read release notes for subprocess, YAML, filesystem, and executable regressions.
