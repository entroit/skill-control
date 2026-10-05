# Feature map

Use this map before changing behavior. Read the listed implementation and the relevant tests; the table identifies ownership rather than prescribing new layers.

| Behavior | Implementation | Verification |
| --- | --- | --- |
| Parse commands, validate command options, print help and JSON, return exit codes | [`src/cli.ts`](../src/cli.ts) | [`test/cli.test.ts`](../test/cli.test.ts) exercises the CLI in subprocesses |
| Run Git with argument arrays and existing authentication | [`src/integrations/git.ts`](../src/integrations/git.ts) | CLI fixtures use temporary Git repositories |
| Resolve Git URLs, GitHub tree and blob URLs, local paths, and `@global`; fetch and clean up source snapshots | [`src/sources/resolve.ts`](../src/sources/resolve.ts) | Git installs, local Markdown, locked sync, and checkout byte preservation |
| Select individual skills or groups; validate frontmatter and Markdown references | [`src/sources/discover.ts`](../src/sources/discover.ts) | Ambiguous collections, invalid paths, symlinks, and broken references |
| Read and validate `skills.json` and `skills.lock.json`; validate names and paths; write deterministic state | [`src/installations/state.ts`](../src/installations/state.ts) | Malicious lock destinations and invalid source paths |
| Initialize, install, pin, remove, promote, and inspect installations; manage discovery links and installation locks | [`src/installations/manager.ts`](../src/installations/manager.ts) | Project and global installs, client collisions, bridge migration, pins, and canonical roots |
| Read, hash, and write complete skill directories, including executable permissions | [`src/skills/files.ts`](../src/skills/files.ts) | Supporting-file changes, local-edit preservation, and Git checkout byte preservation |
| Create groups and add validated skill directories | [`src/groups/manage.ts`](../src/groups/manage.ts) | Group installation, membership changes, and promotion of local edits |
| Update every registered installation, discover managed worktrees, prune missing roots, respect pins, and preserve edits; restore locked content through `sync` | [`src/updates/update.ts`](../src/updates/update.ts), root discovery in [`src/installations/manager.ts`](../src/installations/manager.ts) | Updates across projects and global state, worktrees, individual failures, group pins, and exact sync |
| Print the embedded agent management instructions with `sctl skill` | [`skills/skill-control/SKILL.md`](../skills/skill-control/SKILL.md), text import in [`src/cli.ts`](../src/cli.ts) | Native and npm launcher smoke checks |
| Select the matching native executable through Node, including Linux libc detection | [`bin/sctl.cjs`](../bin/sctl.cjs), [`bin/platform.cjs`](../bin/platform.cjs) | [`test/packaging.test.ts`](../test/packaging.test.ts) |
| Compile native executables and prepare exact-version npm platform packages | [`scripts/distribution/build.ts`](../scripts/distribution/build.ts), [`native-entry.ts`](../scripts/distribution/native-entry.ts), [`targets.ts`](../scripts/distribution/targets.ts), [`prepare.ts`](../scripts/distribution/prepare.ts) | [`smoke-package.ts`](../scripts/distribution/smoke-package.ts), [`smoke-musl.ts`](../scripts/distribution/smoke-musl.ts), platform CI |
| Publish prepared platform packages before the main npm package | [`scripts/distribution/publish.ts`](../scripts/distribution/publish.ts), [`npm-command.ts`](../scripts/distribution/npm-command.ts), [publication workflow](../.github/workflows/publish.yml) | Lockstep version and package completeness checks before publication |
| Enable the local guard against commits on `main` | [`scripts/contributing/setup.ts`](../scripts/contributing/setup.ts), [`.githooks/pre-commit`](../.githooks/pre-commit) | Run setup and test the hook in a temporary Git repository |

## Changes that cross features

Installation writes must stay within managed destinations. Check discovery collisions before replacing skill files. Changes to hashing or path handling affect installation, update, sync, removal, and local-edit detection.

`update` operates across registered project and global roots. `sync` targets one installation and retains locked revisions. Check mode must leave both installation files and the machine-local index unchanged. Failures in one installation must leave other installations eligible for updates.

Project skills are concrete files so a clone can read them without source access. Discovery directories bridge to those files. Preserve unrelated client skills and locally modified managed skills.

The product never executes installed skill scripts or implicitly commits, pushes, or creates pull requests. Contributor hooks and pull request workflows belong to repository development, not CLI installation behavior.

## Test and release entry points

[`test/cli.test.ts`](../test/cli.test.ts) owns behavior tests with temporary repositories and isolated `SCTL_HOME` state. [`test/packaging.test.ts`](../test/packaging.test.ts) owns Node launcher selection and failure cases. Start with the relevant test, then run `bun run check` for implementation changes.

Build and launcher smoke scripts verify the executable distribution. Read [Bun runtime and distribution](bun.md) before changing the runtime pin, compilation, platform matrix, or npm package layout.
