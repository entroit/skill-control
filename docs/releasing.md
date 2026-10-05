# Release to npm

The source package is private to prevent publishing TypeScript source by accident. `release:prepare` creates the public Node launcher and exact-version native platform packages under `dist/npm`. Publish those generated packages only.

## Prepare and review

1. On a task branch, set the release version in `package.json`. Run `bun install --lockfile-only` if dependency metadata changes. Add a description of the changes to the release pull request.
2. Run the checks below, inspect every generated package, and review `git diff --check` and the complete source diff.
3. Merge the pull request after the platform CI checks pass. Release the reviewed `main` revision.

```sh
bun ci
bun run check
bun run build
./dist/sctl --version
bun run release:prepare
bun run release:smoke
bun scripts/distribution/smoke-musl.ts
```

The musl smoke check requires Docker. The local npm smoke check packs and installs the current platform's package and runs the launcher through Node. CI checks the Linux, macOS, and Windows launchers. Cross-compilation alone does not prove execution on every supported architecture.

To produce downloadable packages without publishing:

```sh
gh workflow run release.yml --ref main
```

## First publication

An npm account with publish rights to `@entroit` must create all package names before configuring their trusted publishers. `scripts/distribution/targets.ts` lists the native suffixes. The release has eight native packages and `@entroit/skill-control`.

Use Node 24 and npm 11.5.1 or later. Log into npm with the account that owns the scope, prepare every target from the reviewed revision, then explicitly publish:

```sh
npm login
bun scripts/distribution/publish.ts --confirm-publication --bootstrap-without-provenance
```

The bootstrap flag omits provenance because npm can generate it only in supported CI environments. GitHub Actions rejects that flag and publishes with provenance. The script publishes native packages before the launcher and checks package completeness and lockstep versions first. npm versions are immutable. If a publication stops partway through, inspect the registry before retrying; the script does not skip already published versions.

## Configure trusted publishing

For each of the nine packages, configure an npm trusted publisher with organization `entroit`, repository `skill-control`, workflow filename `publish.yml`, and environment `npm`. Permit direct publication. Follow [npm's trusted publishing instructions](https://docs.npmjs.com/trusted-publishers/).

The GitHub `npm` environment permits protected branches. The publication workflow also requires `main`, serializes publication runs, checks npm OIDC support, and runs checks and launcher smoke tests before publishing with provenance. GitHub credentials do not grant npm scope ownership or configure package settings.

After configuring every trusted publisher:

```sh
gh workflow run publish.yml --ref main
```

Run this only for an unpublished version with passing platform CI. Publication is explicit; PRs and pushes never publish packages. Create a GitHub release describing the published version, then verify the registry path:

```sh
npx --yes @entroit/skill-control@0.1.0 --version
npx --yes @entroit/skill-control@0.1.0 skill
```

Replace `0.1.0` with the released version. Confirm every platform dependency has that same version before announcing the release.
