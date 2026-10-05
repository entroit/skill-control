---
name: skill-control
description: Install skills from Git or local sources, compose groups, promote them between project and global scope, inspect pins and modifications, and update registered installations with sctl.
---

# Skill control

Run `sctl --help` to read this version's commands. Use `sctl skill` to print these instructions without installing the skill separately.

## Choose the target

Project operations use the current Git repository or worktree. Use `--project <path>` for an explicit target. Use `--global` to install or compose groups in the user installation. `sctl update` updates every registered project and global installation by default.

Run `sctl status --json` before changing an existing installation. Read the reported configuration, source revisions, pins, destinations, and local modifications. Files owned by the project remain project-owned.

## Install and compose

Use `sctl install <source>` for a Git URL, GitHub directory or file URL, or local skill path. Use `--path <path>` with a repository URL to choose a subdirectory. A skill directory includes `SKILL.md` and its supporting files. Use `--group <name>` to select a declared source group, or `--all` to select discovered skills. An ambiguous source requires an explicit selection.

Use `--name <name>` for an installed alias. Validate references after a rename. Use `--into <group>` to add imported members to a destination group. Use `sctl group create <name>` and `sctl group add <name> <paths...>` to group existing local skills. No group is installed automatically.

Use `sctl promote <group> --global` to copy a project's effective group into the global installation. The source remains intact. Use `sctl install @global --group <name>` to bring a global group into a project. Copy current content and preserve its update policy and pins. Do not replace edits with refetched content.

## Inspect and update

Run `sctl update --check --json` to inspect upstream changes without changing files or pruning the installation index. Run `sctl update --json` to apply eligible changes everywhere in place. Missing installation locations are pruned. Authentication, permission, and modification failures remain registered and are reported independently.

Pins freeze versions. Local changes block replacement. Read each conflict and prepare an intentional resolution before retrying. `sctl sync` uses exact locked versions in the selected scope and never advances them.

Updates do not commit, push, publish, or create pull requests. Repository files remain ordinary working-tree changes. Managed worktrees may receive updates during active tasks, so coordinate with their owners before invoking an all-installation update during concurrent work.

## Improve a shared skill

Read its source and locked revision. Make shared edits in a separate source worktree or branch. Compare with the latest source before proposing changes so concurrent work is preserved. Validate the complete skill, supporting files, executable permissions, and relative references.

A global installation is machine-local. Sharing through a Git collection is a separate operation. Follow the user's requested Git workflow when publishing changes. Never execute an imported skill's scripts merely to install it.

## Completion

Report the targeted installation paths, changed skills, retained pins, unresolved conflicts, and pruned locations. Do not claim that a partially failed update refreshed every installation. Use JSON results for machine-readable reporting and preserve nonzero exit status on failures.
