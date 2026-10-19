# Security Policy

## Supported versions

This repository is published as periodic snapshots. Only the **current snapshot** (`0.1.16`, dated
`2026-10-20`) is supported; earlier snapshots are not patched. Please reproduce a report against a fresh
checkout of the current snapshot before sending it.

## Threat model: the sandbox is not a security boundary

This is the single most important thing to understand about this project.

The runtime executes `.plugin.js` files inside a `node:vm` context. That context **shares the host V8 heap
and the host process** with the runtime. `node:vm` is a *script isolation* facility, not a *security
isolation* facility, and it is not designed to contain hostile code.

What the sandbox does provide:

- A curated global environment: `require`, `process`, `fs`, `Buffer`, `setTimeout`, `setInterval`,
  `setImmediate` and friends are set to `undefined`.
- A single, auditable entry point for everything a plugin may touch: the `$lib` namespace
  (`$lib.http`, `$lib.storage`, `$lib.settings`, `$lib.util`, `$lib.ui`, `$lib.browser`, plus bundled
  libraries such as `cheerio`, `dayjs` and `CryptoJS`).
- Deterministic, replayable runs: requests and human input go through host callbacks, so a run can be
  replayed from a local snapshot.
- Blast-radius reduction for honest mistakes: a plugin that misbehaves gets a clear error instead of
  reaching the filesystem or the network on its own.

What it explicitly does **not** provide, and what we therefore do not treat as a vulnerability:

- Containment of malicious code. Prototype-chain escapes
  (for example `this.constructor.constructor('return process')()`), dynamic `import()`, and similar
  reachability paths out of a `node:vm` context are **known and expected**. A plugin that breaks out of the
  sandbox is demonstrating the documented limitation of `node:vm`, not a bug in this repository.
- Process, filesystem, network or credential isolation. A plugin shares the runtime's process, its
  environment and its privileges.

**Do not run plugins you do not trust.** If you need real isolation, run the runtime inside an out-of-process
container, or use a genuinely isolated engine (`isolated-vm`, JavaScriptCore in a separate process, …).

## Plugins and content are third-party (and not ours)

Plugins are supplied by third parties. This project does not provide, host, distribute, audit, endorse or
take responsibility for:

- plugin code, its behaviour, or the data it collects;
- the content, availability, legality or terms of any site a plugin talks to;
- any content a user retrieves through a plugin.

A security problem inside a third-party plugin is a matter between you and that plugin's author; report it
there. This project maintains no content sources and no content policy — see
[CONTRIBUTING.md §2](CONTRIBUTING.md#2-scope-what-this-repository-contains).

## In scope for this repository

- The runtime and the CLI under `src/`: sandbox construction, `$lib` injection and its implementations,
  plugin loading and metadata parsing, action dispatch, the `CHALLENGE` handling path.
- The bundled libraries under `assets/js-lib/` (a defect in how they are loaded or wired up — the upstream
  libraries themselves should be reported upstream).
- `contracts/` and `scripts/contract-gates/`: a gate that can be silently bypassed, or a contract that
  permits something the hosts cannot handle safely.
- Anything in this repository that discloses credentials, tokens or personal data.

## Out of scope

- The documented inability of `node:vm` to contain hostile code (see above).
- Third-party plugins and the sites they access; content retrieved through them; their terms of service.
- Vulnerabilities in upstream dependencies with no exploitable path through this project's code (report
  those upstream — the bundled libraries are listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)).
- Findings that require the attacker to already control the plugin directory, the machine, or the user's
  shell.
- Denial of service that only affects a run the user started themselves (for example a plugin that loops).

## Reporting a vulnerability

**Please do not open a public issue for a security report.**

- Preferred: open a private advisory at
  <https://github.com/kongtong9527/lingshu-runtime/security/advisories/new> — it stays private between you and the
  maintainers until a fix is published.
- If you cannot use advisories, open a minimal issue that asks for a private contact channel **without
  including the details**, and a maintainer will follow up.

Please include: the affected snapshot version, the exact commands, a minimal reproduction (a plugin snippet
or a fixture is ideal), the impact you believe it has, and whether you intend to disclose publicly.

## What to expect

This is a volunteer-run project published as periodic snapshots. Reports are handled on a best-effort basis:
acknowledgement when someone is available, triage against the threat model above, and a fix carried in the
next snapshot (which means the fix appears here only after the following release). There is no bug-bounty
programme and no response-time guarantee.
