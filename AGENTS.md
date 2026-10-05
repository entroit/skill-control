# Working in skill-control

Build a generic Git-based skill manager. Do not add Entroit-specific groups or defaults.

Use Bun 1.4.2 for development, builds, and tests. Read `README.md` for public behavior and `docs/bun.md` for runtime and distribution decisions. The npm entry point must work through Node and select a compiled Bun executable so users running `npx` need no Bun installation.

Organize source by feature, with filenames that identify their contents. For example, Git commands belong in `src/integrations/git.ts`. Co-locate feature types and behavior. Create a folder when it owns meaningful behavior; keep the CLI entry thin. Avoid general `utils`, `services`, or `types` folders.

Keep file operations scoped to registered installations. `sctl update` updates every known project and global installation in place, discovers managed Git worktrees, prunes missing locations, respects pins, preserves locally modified skills, and continues after individual failures. No commits, pushes, or PRs happen implicitly.

Validate external manifests, names, and paths at their boundaries. Pass Git arguments as arrays, preserve existing Git authentication, and never execute installed skill scripts. Keep configuration deterministic and test CLI behavior with temporary repositories and isolated user state.

Use separate files or task branches for concurrent work. Run `bun run check`, build the native CLI, and exercise the npm launcher before publication. Inspect the complete diff and run `git diff --check`.
