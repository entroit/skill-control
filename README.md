# skill-control

`sctl` installs agent skills from Git, groups them for reuse, and updates them across your projects and global installation.

## Install

You need Node.js 20 or later and Git. Bun is bundled in the platform executable.

Try it without installing:

```sh
npx @entroit/skill-control --help
npx @entroit/skill-control skill
```

Install the CLI:

```sh
npm install --global @entroit/skill-control
sctl --help
```

## Install a skill

Run these commands in the project that should use the skill. Replace the example repository and paths with your own.

```sh
sctl install https://github.com/owner/skills/tree/main/review
sctl install git@github.com:owner/private-skills.git --path review
sctl install ./review --global
```

A skill contains `SKILL.md` with `name` and `description` frontmatter, plus any supporting files. `--name <alias>` changes its installed name. `--project <path>` targets another repository or worktree. Git uses your existing authentication. Installation never executes skill scripts.

Project skills live in `.agents/skills/`. Links in `.claude/skills/` and `.codex/skills/` let those clients discover the same files. Global skills use your home directory's discovery paths.

## Manage a shared collection

Keep skill directories in a Git repository. In that repository, group existing skills:

```sh
sctl init
sctl group create engineering
sctl group add engineering ./review ./testing
```

Commit the skills and generated `skills.json` and `skills.lock.json`, then push them through your normal Git workflow. In another project, install the group:

```sh
sctl install https://github.com/owner/skills.git --group engineering --into engineering
```

`--group` selects a named group. `--into` records it in the destination for reuse. Use `--all` instead of `--group` to select every discovered skill. No group is installed automatically.

Copy a project group to your global installation:

```sh
sctl promote engineering --global
```

In another project, install that global group:

```sh
sctl install @global --group engineering
```

Promotion copies the current files and retains their update policy and pins. The global installation stays local to your machine; use a Git collection to share skills with others.

## Update and pin

```sh
sctl status --json
sctl update --check --json
sctl update --json
sctl pin review
sctl pin review --unpin
sctl sync
sctl remove review
```

`update` refreshes every registered project and global installation, including managed Git worktrees. It respects pins, preserves locally modified skills, prunes missing installations, and continues after individual failures. `--check` previews changes without writing files.

`sync` restores exact locked versions in the selected installation. It does not advance source revisions. Local edits block replacement. Commands report failures with a nonzero exit status.

Changes remain ordinary working-tree changes. `sctl` never commits, pushes, or creates pull requests. An update can change skills used by agents working in other registered worktrees.

## Give your agent the commands

Ask your agent to run:

```sh
sctl skill
```

This prints the embedded [management skill](skills/skill-control/SKILL.md), so the agent can choose sources and scopes, inspect JSON results, and handle updates or conflicts. No separate management-skill installation is required.

## What to commit

Commit these files so contributors and agents get the same skills when they clone:

```text
skills.json                 Sources, selected skills, groups, and update policy
skills.lock.json            Exact revisions and content hashes
.agents/skills/              Installed skills and their supporting files
.claude/skills/              Client discovery links and managed attributes
.codex/skills/               Client discovery links and managed attributes
```

Do not ignore project skills. Keep the machine-local installation index out of Git. It lives at `~/.config/skillctl/installations.json`; global management files live under `~/.config/skillctl/global`. `XDG_CONFIG_HOME` changes the configuration directory, and `SCTL_HOME` selects an isolated state directory.

## Source limits

Skills must be self-contained. Imports reject symlinks and missing or external relative Markdown references. For GitHub branches containing `/`, use a repository URL with explicit `--ref` and `--path`. Local sources without a reproducible Git snapshot can be installed and updated, but `sync` cannot restore their exact snapshot.

## Contribute

Use Bun 1.4.2 and Git. [CONTRIBUTING.md](CONTRIBUTING.md) covers the pull-request workflow. [docs/features.md](docs/features.md) maps commands to their implementation, and [docs/bun.md](docs/bun.md) explains the runtime and npm distribution.

```sh
bun install --frozen-lockfile
bun run dev --help
bun run check
bun run build
./dist/sctl --help
```

## License

[MIT](LICENSE).
