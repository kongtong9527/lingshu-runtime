# `$lib` 注入契约（插件运行时 API）

> **本文件是签名、单位、缺省值的唯一事实源**（机器可读版：[`lib-api.json`](lib-api.json)）。
> 写法与示例见技能包 `skills/lingshu-plugin-dev/references/api-reference.md`（那篇是用法指南，签名以本篇为准）。
> 三道腿由 `scripts/contract-gates/lib-api.mjs` 守：本文件 ↔ `runtime/src/sandbox.ts`（真跑 `createSandbox()` 反射出 `$lib`）↔ `ios/Lingshu/Runtime/*.swift`（静态抽取桥方法）。
> 改任何一侧的键名或参数个数而不改另两侧 → CI 红。

## 0. 契约怎么读

- **参数带 `?` = 可选**（文档语义）。**两侧比对的都是「参数总数」**：Swift 侧 block 形参个数 == 总数（iOS 桥一律全参收下，可选参数以 `JSValue` 接收后自行判空）；Node 侧 `fn.length` == 总数，**因此实现禁止给可选参数写 JS 默认值**（`function get(url, options = {})` 会让 `fn.length` 截断成 1 → 门红）。可选性一律靠 `??`/判空表达。
- **单位一律毫秒**（`timeout`）。历史上出过「秒/毫秒」误判，故单列此条；iOS 侧由 `PluginTimeout.seconds` 归一（≥1000 按毫秒，缺省 http 60s / browser 30s）。
- **本条契约只锁「函数名 + 参数个数 + 返回语义」**，不锁参数对象的字段集（那是各 API 的用法文档范围）；跨端字段级差异走 conformance 语料。
- **`contractVersion` 是本契约（`$lib` 注入面）的版本号**（[`lib-api.json`](lib-api.json) 顶层字段）。
  **它同时是插件 `manifest.json` 里 `minRuntimeVersion` 的比较基准**（ADR-0009：宿主实现的契约版本 ≥ 插件声明值才允许安装）。
  **它不是 App 的 `MARKETING_VERSION`**——两套号段不同源（App 走 `0.1.x`，契约走 `1.0.x`），
  混用会让 `1.0.x > 0.1.x` 恒成立 ⇒ 仓库页**整仓插件恒显示「不可安装」**，不崩不报错（2026-10 实测：公开插件仓 3 个插件全部点不动）。
- **三条版本号段互不同源，别互相推**（2026-10 解耦，见 [ADR-0069](../docs/adr/0069-contract-version-vs-package-version.md)）：

  | 号段 | 住哪 | 什么时候动 | 谁比它 |
  | --- | --- | --- | --- |
  | App 发行版 `0.1.x` | `ios/project.yml` 的 `MARKETING_VERSION` | 任何改动 `ios/` 的提交 | 用户看「我装的是哪版」 |
  | **契约版本** `1.0.x` | 本目录 `lib-api.json` 的 `contractVersion` | **只随 `$lib` 注入面变更**（方法/参数/返回语义/屏蔽全局/库注册表） | 插件 `minRuntimeVersion`；iOS 宿主如实声明 |
  | **包版本** `1.0.x` | `runtime/package.json` 的 `version` | 每次 npm 发布（补丁、CLI 修复、文档都算） | npm 用户；devconsole 的依赖范围 |

  门 2 的 **L4 版本腿**把三件事钉死：iOS `PluginRuntimeContract.version` ↔ 契约 `contractVersion` **恒等**；
  `runtime/package.json` 的版本 **≥** 契约版本（包可以领先，**不得落后**——落后 = 包发出去了却少注入一个方法）；
  以及**注入面指纹**（`surfaceHash`）——改了面就必须做一次显式决定：递增 `contractVersion`，
  或跑 `node scripts/contract-gates/run.mjs --record-surface-hash` 声明「面变了但语义未变」。
- **插件侧字段仍叫 `minRuntimeVersion`**（不是 `minContractVersion`）：它已随 ADR-0009 发布给插件作者与技能包，
  语义没变（「我需要的最低宿主版本」）。改名的收益只是措辞对称，代价是 31 个插件 + iOS 模型 + 技能模板全动一遍。
  读它的时候记住：**比的是上表的契约版本**。

## 1. 顶层形态

```
$lib = {
  http, browser, storage, settings, util, ui, zlib,   // 宿主注入（本契约 7 个命名空间）
  cheerio, CryptoJS, dayjs, Buffer, crypto, iconvLite, JSEncrypt, jsrsasign  // 第三方库（注册表见 §4）
}
```

全局另有 `console`（`log/warn/error`）。以下全局在插件里**不可用**（Node 侧显式置 `undefined`，iOS 侧 JavaScriptCore 本就不提供）：
`require`、`process`、原生 `Buffer`（用 `$lib.Buffer`）、`setTimeout`、`setInterval`、`setImmediate`、`clearTimeout`、`clearInterval`、`clearImmediate`。

> 定时器类刻意禁用：引入时间相关的隐式行为、破坏可重放性，且无对应宿主语义。但「显式暂停等外部系统」的异步原语是允许的（`$lib.http` 等网络、`$lib.ui` 等人类），二者同构、都可由宿主回放。

## 2. 宿主命名空间

### $lib.http

| 签名 | 返回 |
| --- | --- |
| `$lib.http.get(url, options?)` | `Promise<{status, headers, body}>` |
| `$lib.http.post(url, data?, options?)` | `Promise<{status, headers, body}>` |
| `$lib.http.del(url, options?)` | `Promise<{status, headers, body}>` |
| `$lib.http.setCookies(url, cookies)` | `void` |
| `$lib.http.getCookies(url)` | `Array<{name, value, domain?, path?}>` |
| `$lib.http.deleteCookies(url)` | `void` |

- `options`：`{ headers?, timeout?（毫秒）, rejectUnauthorized?, responseType?: 'text'|'base64', contentType?（仅 post）}`。
- `data`：字符串原样透传、`Uint8Array`/`$lib.Buffer` 按字节发出、对象 `JSON.stringify`。
- cookie jar：进程内按域隔离；显式 `headers.Cookie` 优先于 jar。跨 run 共享靠宿主注入同一个 jar（登录态延续）。
- 挑战识别在宿主（ADR-0052）：命中即抛 `code == 'CHALLENGE'`，插件不得自写判定。

### $lib.browser

| 签名 | 返回 |
| --- | --- |
| `$lib.browser.getHtml(url, options?)` | `Promise<{status, headers, body}>` |

无浏览器腿时恒抛 `CHALLENGE`（ADR-0043）；插件侧重抓已退役（ADR-0060）——插件纯直连、挑战直抛，通道只服务宿主验证链。

### $lib.storage

| 签名 | 返回 |
| --- | --- |
| `$lib.storage.set(key, value)` | `void` |
| `$lib.storage.get(key)` | `string \| undefined` |
| `$lib.storage.remove(key)` | `void` |
| `$lib.storage.clear()` | `void` |

文件持久 KV（插件自管）。值必须是字符串（对象走 `JSON.stringify`）。与 `$lib.settings` 严格分家（ADR-0004）。

### $lib.settings

| 签名 | 返回 |
| --- | --- |
| `$lib.settings.get(key)` | `string \| boolean \| undefined` |

用户偏好（宿主管），**按 run 注入、只读、不持久**；未注入或未声明即 `undefined`，默认值由插件代码自持。

### $lib.util

| 签名 | 返回 |
| --- | --- |
| `$lib.util.randomUUID()` | `string`（RFC 4122 v4） |
| `$lib.util.randomInt(min, max)` | `number`（**闭区间**，含两端） |
| `$lib.util.randomDouble(min, max)` | `number`（**半开区间**，不含 max） |

同步、无状态。沙箱内无安全 RNG，随机字节用 `randomInt(0, 255)` 拼。

### $lib.ui

| 签名 | 返回 |
| --- | --- |
| `$lib.ui.showInputDialog(title, options?)` | `Promise<string>` |
| `$lib.ui.confirm(title, message, buttons?)` | `Promise<string>` |
| `$lib.ui.showMessage(text)` | `void` |
| `$lib.ui.launchUrl(url)` | `void` |

插件 run 中途直问用户（ADR-0006）。无 headed 宿主时：`showInputDialog`/`confirm` **清晰报错**（不静默降级），`showMessage`/`launchUrl` 静默 no-op。窄口径——结构化选择器是宿主编排的多 run 流，不进 `$lib.ui`。

### $lib.zlib

| 签名 | 返回 |
| --- | --- |
| `$lib.zlib.gzipBase64(text)` | `string`（base64） |
| `$lib.zlib.gunzipBase64(base64)` | `string`（utf8） |

加密接口的压缩层走字符串通道，避开 vm 跨 realm 的二进制问题。

## 3. 返回信封（跨端同形，字段级契约）

| 类型 | 形态 |
| --- | --- |
| HTTP 响应 | `{ status: number, headers: Record<string,string>, body: string }` |
| HTTP 请求记录 | `{ method, url, status?, headers?, body? }`（仅 DevConsole 展示用，插件不可见） |

## 4. 第三方库注册表

`$lib` 上的库键名与加载策略必须两侧逐条一致（`runtime/src/lib-loader.ts` 的 `LIB_REGISTRY` ↔ `ios/Lingshu/Runtime/RunEngine.swift` 的 `libRegistry` + `libKeys`）：

| 键 | 文件 | 策略 | 依赖 |
| --- | --- | --- | --- |
| `cheerio` | `cheerio.min.js` | umd | — |
| `CryptoJS` | `CryptoJS.min.js` | call `createCryptoJS` | — |
| `dayjs` | `dayjs.js` | call `loadDayjs` | — |
| `Buffer` | `Buffer.min.js` | call `loadBuffer` | — |
| `crypto` | `crypto.js` | call `loadCrypto` | — |
| `iconvLite` | `iconv-lite.js` | call `loadIconv` | — |
| `JSEncrypt` | `JSEncrypt.min.js` | call `loadJSEncrypt` | CryptoJS |
| `jsrsasign` | `jsrsasign.js` | globals `KJUR` | CryptoJS |

`assets/js-lib/**` 是 iOS 内置拷贝的唯一来源（`ios/Scripts/sync-vendor.sh` + `vendor.lock`）——改库必须重跑同步，否则 iOS 静默用旧库。
