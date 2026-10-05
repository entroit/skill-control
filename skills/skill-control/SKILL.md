---
name: skill-control
description: Install, update, pin, and share agent skills from Git with sctl. Use when adding a skill to a project or the user's machine, updating installed skills, or curating a team skill repository.
---

# Skill control

`sctl --help` lists this version's commands and options. Add `--json` to any command whose result you will read.

## Before changing skills

Run `sctl status --json` in the target. Each skill reports its source, commit, `pinned`, and `state`: `clean`, `modified`, or `missing`. Treat a `modified` skill as someone's work in progress.

The target is the current Git repository. `--global` targets the user's machine; `--project <path>` targets another project.

## Install

1. Choose the source: `owner/repo` for GitHub, any Git URL, or a local path.
2. Run `sctl install <source> <skill...>`. Without names, a source with several skills lists them and installs nothing.
3. For a team skill repository, install a published group with `sctl install <source> --group <name>`.

Install copies skill files into `.agents/skills/` and links them for Claude Code and Codex. It never runs a skill's scripts.

## Update

1. Run `sctl update --check --json` and read each result's `state`.
2. Run `sctl update --json` when the preview matches the user's intent.

`update` reaches every project, worktree, and global installation on the machine. Other agents may be working in those worktrees; ask the user before updating during concurrent work.

Result states:

- `updated`, `unchanged`, `pinned`: done.
- `conflict`: the skill has local edits, or a new name collides. Report it; the user decides whether to keep the edits or remove the skill and reinstall.
- `failed`: report the message. Other installations still updated.

`sctl sync` restores the exact commits in `skills-lock.json` without advancing them. Use it after a clone or when files went missing.

## Curate a skill repository

A skill repository is an ordinary Git repository that projects install from.

- `sctl install <upstream> <skill> --into <group>` imports a skill and keeps its upstream source, so `sctl update` in the repository pulls upstream changes.
- `sctl group add <group> <path...>` adds skills written in the repository.
- Publishing is the user's Git workflow. `sctl` leaves changes in the working tree.

To change a shared skill, edit it in the skill repository, not in a project that installed it. A project's edits block that skill's updates.

## Report

List the installations touched, skills changed, skills left pinned, and every conflict or failure with its message. Say so when an update only partly succeeded, and keep the nonzero exit status.
