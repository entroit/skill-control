# skill-control

`sctl` manages Git-sourced skills and user-defined groups in repositories and the global user installation. Installed skills are concrete files. Clones can read them without this CLI or access to the source collection.

`update` refreshes every registered installation in place, including managed Git worktrees. It respects pins, preserves local modifications, and prunes missing locations. It does not create commits or pull requests.

## Development

Use Bun 1.4.2 and Git. The repository's mise configuration pins Bun.

```sh
bun install
bun run dev --help
bun run check
bun run build
./dist/sctl --help
```

Source code is organized by feature, with files such as `src/integrations/git.ts` and `src/updates/update.ts`.

## Install skills

```sh
sctl install https://github.com/owner/skills/tree/main/review
sctl install git@github.com:owner/private-skills.git --path review
sctl install ./review --global
sctl install ./collection --group engineering
```

The source's directory and frontmatter identify the skill. `--name` chooses an installed alias. Skill directories include references, scripts, and assets. Git uses the authentication already configured on the machine. Installation never executes skill scripts.

The first installation creates `skills.json` and `skills.lock.json` in the target repository. `init` creates empty management files without installing a default group. Use `--project <path>` to select another repository or worktree.

## Files and ownership

Commit these project files so another agent can clone and start working:

```text
skills.json                 Sources, selections, groups, and update policy
skills.lock.json            Exact revisions and installed content hashes
.agents/skills/<name>/       Concrete skill files and supporting resources
```

`init` starts with this `skills.json`:

```json
{ "version": 1, "imports": [], "groups": {} }
```

Project discovery paths under `.claude/skills` and `.codex/skills` point to the project’s concrete `.agents/skills` directories. Existing client directories can keep unrelated skills. POSIX uses relative symlinks; Windows uses directory junctions.

Global management files and concrete skills live under `~/.config/skillctl/global`; discovery links expose them through `~/.agents/skills`, `~/.claude/skills`, and `~/.codex/skills`. `XDG_CONFIG_HOME` changes the configuration location.

The lockfile records resolved content; it is not a history log. Git provides the project history. The machine-local `installations.json` indexes locations for all-installation updates and should not be committed. `SCTL_HOME` selects an isolated state directory for tests or separate environments.

## Compose and promote groups

```sh
sctl group create engineering
sctl group add engineering ./review ./testing
sctl install ./collection --group engineering --global
sctl promote engineering --global
sctl install @global --group engineering
```

Groups are named selections of skill directories. `--group` selects a group from a source. `--into` adds imported members to a group in the destination. Promotion copies effective files and keeps the source intact. Global installation is machine-local; sharing a collection through Git is a separate operation.

## Update installations

```sh
sctl status --json
sctl update --check --json
sctl update --json
sctl pin review
sctl sync
```

`update` targets all known installations by default. The installation index is stored in `~/.config/skillctl/installations.json`. Project and global initialization register their locations. Managed worktrees are discovered through Git. Missing locations are removed during an applied update. Authentication, permission, and modification failures remain registered. Check mode changes neither installations nor their index.

`sync` uses exact locked versions in the selected installation. It does not advance source revisions. Pins retain the installed version during updates. Local edits block replacement. Failures are reported per installation and do not prevent other locations from updating.

Repository changes remain ordinary working-tree changes. An all-installation update can change instructions used by an active agent in another worktree.

## Agent instructions

```sh
sctl skill
sctl status --json
```

`skill` prints the embedded [management skill](skills/skill-control/SKILL.md). Agents can read it without a separate skill installation. Machine-readable commands return JSON and nonzero exit status when an operation fails.

## npm distribution

The package is prepared for publication as `@entroit/skill-control`, with executable `sctl`. Once published, users can invoke it with:

```sh
npx @entroit/skill-control --help
```

The npm package uses a Node launcher and exact-version optional platform packages containing compiled Bun executables. End users need Node and Git, with no prior Bun or CLI installation. Publication is a separate release action; creating this repository does not publish an npm package.

## Current boundaries

Skills must be self-contained directories. Imports reject symlinks, missing relative Markdown references, and references outside the skill directory. Collections with cross-skill references need a layout contract before they can be imported. For GitHub branches containing `/`, pass `--ref` and `--path` explicitly. Local sources without a reproducible Git snapshot can be installed and updated, but cannot restore an exact snapshot through `sync`.

Read [Bun runtime and distribution](docs/bun.md) for the verified October 2026 release and feature choices.

## License

MIT.
