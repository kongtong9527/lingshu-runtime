# Third-Party Notices

This file lists the third-party software that this repository **distributes** or **depends on**, with
licenses and upstream links.

- §1 covers the libraries bundled in [`assets/js-lib/`](assets/js-lib) — these are **copied into the
  repository** and injected into the plugin sandbox, so their notices belong here.
- §2 covers the npm dependencies — these are declared in `package.json` and fetched by npm at install time.
  This repository does not redistribute them; their license texts ship inside the packages themselves.
- §3 reproduces the license texts referenced above, so this file is self-contained.
- §4 explains how to re-audit the dependency tree.

## 1. Bundled sandbox libraries (`assets/js-lib/`)

These bundles are injected into the sandbox as part of the `$lib` surface. They are upstream distributions
(minified or concatenated) whose **license headers were stripped when they were bundled**, so the license
texts are reproduced in §3 rather than read from the files.

| File | Library | License | Upstream |
| --- | --- | --- | --- |
| `cheerio.min.js` | cheerio | MIT | <https://github.com/cheeriojs/cheerio> |
| `dayjs.js` | Day.js | MIT | <https://github.com/iamkun/dayjs> |
| `CryptoJS.min.js` | crypto-js | MIT | <https://github.com/brix/crypto-js> |
| `Buffer.min.js` | buffer (Feross Aboukhadijeh) | MIT | <https://github.com/feross/buffer> |
| `crypto.js` | crypto-browserify | MIT | <https://github.com/browserify/crypto-browserify> |
| `iconv-lite.js` | iconv-lite | MIT | <https://github.com/ashtuchkin/iconv-lite> |
| `JSEncrypt.min.js` | jsencrypt | MIT | <https://github.com/travist/jsencrypt> |
| `jsrsasign.js` | jsrsasign (includes Yahoo! YUI code) | MIT **and** BSD-3-Clause (YUI portion) | <https://github.com/kjur/jsrsasign> · YUI notice retained in the file header: `Copyright (c) 2011, Yahoo! Inc.` |

Note on the bundled library set: the versions shipped here are the ones that were bundled; the bundles carry
no version string. When you upgrade one of them, update this table in the same change.

## 2. npm dependencies

Runtime dependencies:

| Package | License | Upstream |
| --- | --- | --- |
| `undici` | MIT | <https://github.com/nodejs/undici> |
| `commander` | MIT | <https://github.com/tj/commander.js> |

Development and build dependencies (not shipped to users):

| Package | License | Upstream |
| --- | --- | --- |
| `typescript` | Apache-2.0 | <https://github.com/microsoft/TypeScript> |
| `@types/node` | MIT | <https://github.com/DefinitelyTyped/DefinitelyTyped> |
| `vitest` | MIT | <https://github.com/vitest-dev/vitest> |
| `ajv` | MIT | <https://github.com/ajv-validator/ajv> |

`ajv` is used by the conformance gate (`scripts/contract-gates/conformance.mjs`) to validate the corpus
against `contracts/card-dsl.schema.json`.

**No GPL or AGPL dependency is used by this repository.** (The project's only weak-copyleft dependency —
`sharp`, which pulls in prebuilt libvips binaries under LGPL-3.0-or-later — belongs to the web dev console
repository, not to the runtime.)

## 3. License texts

### 3.1 MIT License

Applies to: cheerio, Day.js, crypto-js, buffer, crypto-browserify, iconv-lite, jsencrypt, jsrsasign,
`undici`, `commander`, `@types/node`, `vitest`, `ajv`.

```text
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Each library's own copyright line is retained by its authors; see the upstream repositories above.

### 3.2 BSD 3-Clause License (YUI portion of `jsrsasign.js`)

```text
Copyright (c) 2011, Yahoo! Inc. All rights reserved.
Code licensed under the BSD License.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright notice,
      this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright notice,
      this list of conditions and the following disclaimer in the documentation
      and/or other materials provided with the distribution.
    * Neither the name of Yahoo! Inc. nor the names of its contributors may be
      used to endorse or promote products derived from this software without
      specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### 3.3 Apache License 2.0

`typescript` is distributed under the Apache License, Version 2.0. The full text is available at
<https://www.apache.org/licenses/LICENSE-2.0> and ships with the package
(`node_modules/typescript/LICENSE.txt`).

## 4. Re-auditing the dependency tree

```bash
npm ls --all                          # the installed tree, with versions
npm ls --all --json > /tmp/tree.json  # feed the JSON to whichever licence-audit tool you prefer
```

When you add a dependency: add it to §2 with its license and upstream link, and add its license text to §3
if it is not MIT. When you upgrade a bundled library in `assets/js-lib/`, update §1 in the same change.
Contributions that add third-party material under an incompatible license cannot be accepted — see
[CONTRIBUTING.md](CONTRIBUTING.md).
