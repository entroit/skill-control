# Contribute

Use Bun 1.4.2, Node 24, and Git. Fork this repository if you do not have write access.

```sh
git switch -c fix/describe-the-change
bun ci
bun run setup
bun run dev --help
```

`bun run setup` enables the local commit guard for `main`. GitHub requires pull requests, one approving review, resolved conversations, and passing CI on an up-to-date branch. These rules apply to administrators too. Maintainers squash merge and GitHub deletes merged branches.

Read the [feature map](docs/features.md) before changing behavior. Keep each pull request focused on one change. For a bug, include the command that reproduces it and a regression test through the CLI. Use temporary repositories and isolated `SCTL_HOME` state. Tests must not update your real skill installations.

Before opening a pull request:

```sh
bun run check
bun run build
./dist/sctl --help
bun run release:prepare linux-x64-glibc
bun run release:smoke
git diff --check
```

Select your platform from `scripts/distribution/targets.ts` for `release:prepare`. CI checks Linux, macOS, Windows, and Linux musl. Review the entire diff, including generated management files. Describe the behavior change and validation in the pull request. Documentation changes should include verified commands.

Use [issues](https://github.com/entroit/skill-control/issues) for reproducible bugs and proposed changes. Search existing issues first. Include the CLI version, operating system, commands, and expected result. Remove credentials and private source URLs from logs. Report vulnerabilities through [private security reporting](https://github.com/entroit/skill-control/security/advisories/new).

Read [development skills](docs/development-skills.md) for the optional P-Stack installation and [release instructions](docs/releasing.md) before preparing npm publication.
