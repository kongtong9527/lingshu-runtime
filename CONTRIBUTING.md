# Contributing to Lingshu Runtime

Thanks for taking the time to contribute. This document explains how this repository is produced, what
belongs here, and what a change has to look like to survive the next release.

## 1. How this repository is produced (read this first)

This repository (`kongtong9527/lingshu-runtime`) is a **published snapshot** of an upstream development repository. Each
release is written by publishing tooling that takes a whitelisted subset of the upstream tree, applies
redaction rules, injects the files under `.github/` and the top-level community documents from a template,
and commits the result here.

Two consequences you cannot work around:

- **A merged commit here is not durable.** The next release replaces the tracked tree with a fresh upstream
  snapshot, so anything that only exists here disappears again. **Pull requests must be carried upstream to
  take effect.** Maintainers import accepted patches into the upstream repository (keeping the original
  author) and the next snapshot brings them back here. Until that happens, treat this repository as
  read-mostly.
- **Do not edit CI in this repository.** Everything under `.github/` — the workflows, the issue templates
  and the pull-request template — is **injected from the upstream templates** on every release. Local edits
  are silently overwritten and cannot be reviewed. If a workflow needs to change, say so in an issue or in
  your pull request description, and the maintainers will change the upstream template instead.

## 2. Scope: what this repository contains

In scope: the runtime and the `lingshu` CLI (`src/`), the bundled sandbox libraries (`assets/js-lib/`),
the cross-platform contracts (`contracts/`), the contract gates (`scripts/contract-gates/`), the plugin
development skill package (`skills/lingshu-plugin-dev/`) and this repository's own documentation.

**Out of scope — these will be closed without discussion:**

- **Content sources, site implementations and content policy.** This repository contains no site-specific
  plugin, no site list, no feed, no scraper configuration and no allow/deny list of sites. Requests to add
  one — in code, in the sample fixtures, in documentation or in an issue — are out of scope by design.
- **Requests to make the runtime fetch, bundle, proxy or ship content for adult or pirate sites**, or any
  other request whose purpose is to add content sources rather than to improve the runtime. Such issues and
  pull requests are not accepted, and this repository maintains no such policy to change.
- Support for third-party plugins themselves. This project does not author, host or audit plugins; a plugin
  that behaves badly is a matter between you and whoever gave it to you. If a plugin exposes a *runtime*
  defect (sandbox semantics, `$lib` contract, action dispatch), that is in scope — please report it with a
  minimal reproduction.
- Enabled GitHub Actions minutes, release automation beyond the injected workflow, and anything requiring
  credentials of this repository's maintainers.

## 3. Development setup

```bash
npm ci
npm run build          # tsc → dist/
npm test               # vitest
```

Before opening a pull request, run the same checks CI runs:

```bash
npm run build
node scripts/contract-gates/run.mjs
npm test
```

- Missing contract-gate legs are **skipped and reported** in this repository (the Swift host lives in the
  iOS repository) — that is expected. Do not set `CONTRACT_REQUIRE_ALL=1` here.
- `npm test` (vitest) does **not** type-check. `npm run build` does, and it is what CI runs.

## 4. Changing the contracts

`contracts/` is the single source of truth shared by the Node runtime, the web dev console and the Swift
host, and the gates are deliberately strict. If you touch the card DSL, the `$lib` surface or the
conformance corpus:

- Add or remove a card field in **all** places the gates compare (schema, `src/types.ts`, the Swift model in
  the iOS repository) **and** add a conformance case that exercises it — the coverage assertion fails
  otherwise.
- Do not give optional parameters a JavaScript default value in `$lib` factory functions: a default truncates
  `fn.length` and breaks the signature gate.
- Keep the documented `$lib` reference (`contracts/lib-api.md`) in sync with `contracts/lib-api.json`; the
  gate compares the two.
- Regenerate expectations only with `node scripts/contract-gates/conformance.mjs --record`, and never from CI.

## 5. Pull requests

1. Open an issue first for anything larger than a bug fix, so the change can be discussed before you spend
   time on it.
2. Keep the change focused; one topic per pull request.
3. Describe **why**, not only **what**, and include the commands you ran.
4. Sign off every commit (`git commit -s`), certifying the [Developer Certificate of Origin](https://developercertificate.org/).
   This project uses the **DCO instead of a CLA** — there is no copyright assignment to sign.
5. Expect a delay: accepted work is carried upstream before it can appear in a later snapshot, and review
   happens there.

## 6. Reporting bugs and security issues

- Functional bugs and feature requests: use the issue templates in this repository.
- **Security issues: do not open a public issue.** Follow [SECURITY.md](SECURITY.md).

## 7. License

By contributing you agree that your contribution is licensed under the MIT License of this repository
(see [LICENSE](LICENSE)). Third-party material you add must be compatible with MIT and must be listed in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) with its license text.

## 8. Code of conduct

Participation in this project is covered by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
