# Lingshu Runtime

[![CI](https://github.com/kongtong9527/lingshu-runtime/actions/workflows/ci.yml/badge.svg)](https://github.com/kongtong9527/lingshu-runtime/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-3c873a.svg)](https://nodejs.org)

**English** · [简体中文](README.zh-CN.md)

> [!IMPORTANT]
> **Lingshu (灵枢) is a plugin-driven content-aggregation runtime.** It executes `.plugin.js`
> scripts supplied by a user inside a `node:vm` sandbox and returns normalised content models
> (list, detail, reading page, categories, search, playback entry) through a single `$lib` API surface.
>
> **This repository contains no content source, no site implementation and no content policy.**
> It ships the runtime, the `lingshu` CLI, the cross-platform contracts, the contract gates and the
> plugin-development skill package. There is no bundled plugin, no site list, no default feed and no
> filter for what a plugin may talk to.
>
> **The sandbox is not a security boundary.** `node:vm` contexts share the host V8 heap; prototype-chain
> escapes (`this.constructor.constructor('return process')()`) and dynamic `import()` are known escape
> paths. The sandbox exists for **development-time isolation and dangerous-API blocking**
> (`require` / `process` / `fs` / timers are set to `undefined`), **not** for executing untrusted code.
> Do not run plugins from sources you do not trust — use a real isolation runtime
> (an out-of-process container, `isolated-vm`, JavaScriptCore, …) for that.
>
> **Plugins are third-party.** Every plugin you load is provided by somebody else. This project does not
> provide, host, audit, endorse or take responsibility for plugin content, for the sites a plugin talks
> to, or for how you use the results. Review a plugin before you run it.

## What is in this repository

| Path | What it is |
| --- | --- |
| `src/` | The runtime and the `lingshu` CLI: `node:vm` sandbox, `$lib` injection, plugin loader, commands |
| `assets/js-lib/` | Third-party libraries injected into the sandbox (`cheerio`, `dayjs`, `CryptoJS`, …) |
| `contracts/` | Single source of truth: card-DSL JSON Schema, `$lib` API manifest, cross-platform conformance corpus |
| `scripts/contract-gates/` | The four contract gates (see [Contracts and gates](#contracts-and-gates)) |
| `skills/lingshu-plugin-dev/` | Skill package for authoring plugins: workflow, `$lib` reference, card DSL reference, template |
| `docs/` | Host-side notes: programmatic API, fixture modes, binary HTTP, challenge messages |
| `AGENTS.md` | Host-side engineering notes: sandbox semantics, action dispatch, fixture modes, red lines |

This repository is one of several published snapshots of the same project (runtime, web dev console,
sample plugins, iOS host). See [Related repositories](#related-repositories).

## Requirements

- **Node.js ≥ 18** (Node 20 LTS recommended)
- npm

## Quick start

Third-party plugin authors do not need to clone this repository. Install the runtime globally and work in
any empty directory:

```bash
npm i -g lingshu-runtime
lingshu --version          # confirm the global CLI is ready
mkdir my-plugins && cd my-plugins
lingshu init <plugin-id>   # scaffold <plugin-id>.plugin.js + _fixtures/<plugin-id>/
lingshu test <plugin-id> --dir .
```

Get the authoring skill package (workflow, `$lib` reference, card DSL reference, template) into your
agent setup with the CLI itself — no extra installer needed (it ships inside this package under
[`skills/lingshu-plugin-dev/`](skills/lingshu-plugin-dev)):

```bash
lingshu skill install          # global, all agents (claude/cursor/codex/agents)
lingshu skill install --project --agent claude   # or: project-local, one agent
```

Or clone this repository for a source checkout:

```bash
git clone https://github.com/kongtong9527/lingshu-runtime.git
cd lingshu-runtime
npm ci                   # if this checkout has no lockfile, use `npm install` instead
npm run build            # tsc → dist/
node dist/index.js --help
```

`npm run build` compiles TypeScript to `dist/`. Build output is intentionally not committed, so a fresh
clone always needs a build before the CLI or the gates can run.

### Running a plugin

This repository ships **no plugin**. Point `--dir` at a directory of `.plugin.js` files that you obtained
yourself (see [`skills/lingshu-plugin-dev/`](skills/lingshu-plugin-dev) if you want to write your own):

```bash
# List the plugins found in a directory
node dist/index.js list --dir /path/to/plugins

# Run an action; `target` is a URL for detail/reading/play, a query for search
node dist/index.js run example-plugin list --dir /path/to/plugins
node dist/index.js run example-plugin detail https://example.com/post/1 --dir /path/to/plugins
node dist/index.js run example-plugin search "example query" --dir /path/to/plugins

# Validate a plugin's metadata header and exported method signatures
node dist/index.js test example-plugin --dir /path/to/plugins

# Walk a plugin's navigation tree and verify every leaf still returns items
node dist/index.js listings example-plugin --dir /path/to/plugins
```

`--dir` may be omitted: the CLI then falls back to `../lingshu-plugins`, `./lingshu-plugins` and finally
the current working directory. Passing `--dir` explicitly is the only form that cannot pick up an
unrelated directory, so it is what the examples above use.

Equivalent spellings: `npm run lingshu -- list --dir /path/to/plugins`, or the `lingshu` bin once the
package is installed as a dependency. With a global install (`npm i -g lingshu-runtime`) the same CLI
is available as both `lingshu` and `lingshu-runtime` (so `npx lingshu-runtime list --dir .` works too).

### Offline mode (`--fixture`)

`--fixture` replaces network access with a local snapshot — the standard way to develop and regression-test
a plugin deterministically:

- `--fixture <file>`: the same snapshot body is returned for **every** request (fine for single-hop actions).
- `--fixture <dir>`: the directory contains an `index.json` whose `routes` map request URLs to snapshot
  files (optionally matching on request headers). Unmatched requests **fail loudly** instead of silently
  receiving the wrong body — this is the form multi-hop actions need.

```bash
node dist/index.js run example-plugin list   --dir /path/to/plugins --fixture /path/to/fixture/list.html
node dist/index.js run example-plugin detail https://example.com/post/1 \
  --dir /path/to/plugins --fixture /path/to/fixture/          # directory form
```

### CLI reference

| Command | What it does | Notable options |
| --- | --- | --- |
| `list` | List the plugins found in a plugin directory | `--dir` |
| `run <plugin-id> <action> [target]` | Run one plugin action | see below |
| `test <plugin-id>` | Validate the metadata header and the exported method signatures | `--dir` |
| `listings <plugin-id>` | Recursively verify a plugin's navigation tree (groups, leaves, filters, tags/explore leaves) | `--dir`, `--fixture` |

`run` actions: `list`, `detail`, `search`, `reading`, `play`, `categories`, `listings`, `explore`, `tags`,
`setting-action`, `login`, `logout`, `me`, `invoke`.

`run` options:

| Option | Meaning |
| --- | --- |
| `--dir <path>` | Plugin directory (see above) |
| `--page <n>` / `--cursor <token>` | Paging for `list` / `search` / `tags` |
| `--category <filter>` | Filter combination string, e.g. `region=cn&type=hot` |
| `--url <url>` | Page channel for `list`; explore-page id for `explore` |
| `--channel <id>` | Listing channel identifier, passed through to the plugin as `PluginContext.channel` |
| `--fixture <path>` | Local snapshot (file or directory) |
| `--settings <json>` | User preferences injected as `$lib.settings` |
| `--inputs <json>` | Login form inputs (`login`) |
| `--params <json>` | Generic call parameters (`invoke`) |

Exit codes: `0` on success. A plugin that hits an anti-bot challenge and has no browser channel reports a
`CHALLENGE` error and exits non-zero — that is the documented behaviour of the pure-Node runtime, not a
defect (offline verification belongs in `--fixture` mode).

## Contracts and gates

`contracts/` is the only source of truth shared by the Node runtime, the web dev console and the Swift
(iOS) host: the card-DSL schema, the `$lib` signature manifest and the conformance corpus. The gates in
`scripts/contract-gates/` keep the three sides from drifting apart:

```bash
npm run build                              # gates 2 and 3 read dist/
node scripts/contract-gates/run.mjs        # gate 0 naming · gate 1 field sets · gate 2 $lib signatures · gate 3 corpus
npm run contract:check                     # the same thing, after a build (alias defined in package.json)
```

The three sides and what each gate pins down are described in [`contracts/README.md`](contracts/README.md).

A few points that are easy to get wrong:

- **Legs that do not exist here are skipped and reported, by design.** Gates 1 and 2 also compare against the
  Swift host (`CardModels.swift`, the `$lib` bridge) and gate 3 runs its corpus in the iOS test bundle.
  Those files live in the iOS repository, which is a separate snapshot — this repository has no Swift.
- **Do not set `CONTRACT_REQUIRE_ALL=1` in this repository.** That variable means "all three legs must be
  present" and is used by the upstream development repository, where the Swift host is in the same tree.
  Setting it here would turn the documented "skipped leg" reports into failures.
- Gate 3 additionally asserts **field coverage**: every field the schema declares must be exercised by some
  valid corpus case. Adding a field without adding corpus is a failure, not a warning.
- The corpus expectations (`expect.counts`) are maintained with
  `node scripts/contract-gates/conformance.mjs --record`, which only fills in missing values and must never
  be used in CI.

## Using it as a library

`package.json` exposes `dist/lib.js` (with `dist/lib.d.ts`) as the package entry point, so hosts can reuse the
run engine and the card-DSL validator instead of re-implementing them:

```ts
import { executeRun, loadPlugin, validateCardDSL, shouldFallbackCard } from 'lingshu-runtime'
```

The entry point re-exports the run engine (`executeRun`, `resolvePluginDir`, `findPluginFile`), the plugin
loader (`loadPlugin`, `parsePluginMeta`), the card-DSL validator (`validateCardDSL`, `shouldFallbackCard`,
`CARD_LIMITS`) and the host-side challenge helpers; the contract types are forwarded wholesale from
`src/types.ts` (`export type *`). Note that `dist/` is built from `src/` (`npm run build`), so a consumer
always needs a built package.

Install it from npm — `npm i lingshu-runtime` — or, if you are hacking on the runtime itself, build this
repository and depend on the resulting directory (or add a git dependency pinned to a release tag).

Releases are published **from CI**, not from a laptop: `.github/workflows/release.yml` uses npm
[trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC, no token anywhere) and the
attestation is generated automatically. The package version is the **runtime contract version**, and it
is locked to the contract and to the iOS host by the contract gates — see
[`contracts/lib-api.md`](contracts/lib-api.md) §0.

## Security

The sandbox is a development aid, **not** a security boundary — the threat model and the reporting process
are documented in [SECURITY.md](SECURITY.md). Read it before running a plugin you did not write.

## License

MIT — see [LICENSE](LICENSE). Bundled third-party libraries and their licenses are listed in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## Contributing

Issues and pull requests are welcome — read [CONTRIBUTING.md](CONTRIBUTING.md) first. In short: this
repository is a published snapshot of an upstream development repository; the CI files are injected from
upstream templates and must not be edited here; and a pull request has to be carried upstream before it can
take effect in a later snapshot. Please sign your commits off (`git commit -s`); this project uses the DCO,
not a CLA.

## Related repositories

| Repository | What it is |
| --- | --- |
| [`kongtong9527/lingshu-devconsole`](https://github.com/kongtong9527/lingshu-devconsole) | Web dev console: visual plugin runs, request tracing, preview and playback diagnostics |
| [`kongtong9527/lingshu-plugins`](https://github.com/kongtong9527/lingshu-plugins) | Small set of documentation-grade sample plugins plus a manifest |
| `lingshu-ios` | SwiftUI + JavaScriptCore host that runs the same `.plugin.js` files on device (source not published yet) |

Each repository is an independent snapshot with its own license; none of them contains content sources.

---

Snapshot: `2026-10-19` · snapshot tag `v0.1.14`
