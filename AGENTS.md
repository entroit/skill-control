# Working in skill-control

Build a generic Git-based skill manager. Do not add Entroit-specific groups or defaults.

## Before changing files

- Engineering work must start with [the feature map](docs/features.md) to identify the implementation and tests for the changed behavior. When installed, use [development mode](.agents/skills/development-mode/SKILL.md) for the P-Stack workflow. Otherwise follow this repository's implementation and completion rules. Read [development skill setup](docs/development-skills.md) when installing or updating those optional skills.
- Public command changes must follow [README.md](README.md). Runtime, dependency, build, and distribution changes must follow [Bun decisions](docs/bun.md).
- Writing must use [unslop](.agents/skills/unslop/SKILL.md). Agent instructions, skills, and their referenced documents must also use [writing for agents](.agents/skills/writing-for-agents/SKILL.md).
- TypeScript changes must use [TypeScript best practices](.agents/skills/typescript-best-practices/SKILL.md) when installed.
- Contribution and pull request work must follow [CONTRIBUTING.md](CONTRIBUTING.md). Release preparation and publication must follow [the release procedure](docs/releasing.md).

Work on a task branch and deliver changes through a pull request. Never commit or push directly to `main`. Use separate files or task branches for concurrent work.

## Implementation rules

Use Bun 1.4.2 for development, builds, and tests. The npm entry point must work through Node and select a compiled Bun executable so users running `npx` need no Bun installation.

Organize source by feature, with filenames that identify their contents. For example, Git commands belong in `src/integrations/git.ts`. Co-locate feature types and behavior. Create a folder when it owns meaningful behavior; keep the CLI entry thin. Avoid general `utils`, `services`, or `types` folders.

Keep file operations scoped to registered installations. `sctl update` updates every known project and global installation in place, discovers managed Git worktrees, prunes missing locations, respects pins, preserves locally modified skills, and continues after individual failures. No commits, pushes, or PRs happen implicitly.

Validate external manifests, names, and paths at their boundaries. Pass Git arguments as arrays, preserve existing Git authentication, and never execute installed skill scripts. Keep configuration deterministic and test CLI behavior with temporary repositories and isolated user state.

Commit project skill sources, lockfiles, and concrete `.agents/skills` files. Keep optional registry symlinks, machine-local installation indexes, and generated build artifacts outside Git. Update shared skills through their source and review the resulting project diff.

## Completion

Run `bun run check` for implementation changes. Before publication, build the native CLI and exercise the npm launcher. Update the feature map when behavior changes ownership or gains a new module. Inspect the complete diff and run `git diff --check` before handing off a pull request.
