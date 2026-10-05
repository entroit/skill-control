# Development skills

This repository commits the concrete `unslop` and `writing-for-agents` skills, their relative client links, `skills.json`, and `skills.lock.json`. They come from the shared [skills repository](https://github.com/entroit/skills). A clone has these instructions without a registry checkout. Their lockfile records the source revision and content hashes.

Restore locked content from an isolated state directory when preparing a pull request:

```sh
SCTL_HOME="$(mktemp -d)" bun run dev sync
```

To advance upstream versions, register only this project in a fresh state directory:

```sh
sctl_state="$(mktemp -d)"
SCTL_HOME="$sctl_state" bun run dev init
SCTL_HOME="$sctl_state" bun run dev update --check
SCTL_HOME="$sctl_state" bun run dev update
```

Review changes before committing. Ordinary `sctl update` targets all installations known to its state directory.

## Install P-Stack locally

P-Stack contains references between skill directories. `sctl` currently rejects these references because it imports self-contained skills. The existing registry installer preserves P-Stack's layout through symlinks into a local registry checkout.

```sh
git clone https://github.com/entroit/skills.git /path/to/skills
git -C /path/to/skills checkout a2699abb20deb0bed3fe258f1560354990f6ee13
/path/to/skills/bin/skills install dev "$PWD"
```

Run the installation from this repository's root. The pinned revision contains the selected P-Stack 0.15.9 skills and client compatibility guidance. Start with `.agents/skills/development-mode/SKILL.md`. P-Stack's Cursor-specific tools and models remain subject to what your client provides.

The optional registry links under `.agents/skills`, `.codex/skills`, `.claude/skills`, and `.cursor/skills` are ignored because they contain machine-specific paths. The two committed contributor skills remain tracked. This installs development instructions for this repository; it adds no default groups to the CLI's users.

The registry installer also reconciles global base skill links. It preserves existing files and rejects collisions. Installation does not execute imported skill scripts. Restart clients that cache skill discovery. Newly installed skills are available in the next agent turn.
