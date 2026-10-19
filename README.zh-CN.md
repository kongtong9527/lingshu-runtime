# 灵枢运行时（Lingshu Runtime）

[![CI](https://github.com/kongtong9527/lingshu-runtime/actions/workflows/ci.yml/badge.svg)](https://github.com/kongtong9527/lingshu-runtime/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-3c873a.svg)](https://nodejs.org)

[English](README.md) · **简体中文**

> [!IMPORTANT]
> **灵枢是一套「插件驱动的内容聚合运行时」**：它在 `node:vm` 沙箱里执行由使用者自行提供的 `.plugin.js`
> 脚本，通过统一的 `$lib` 接口返回归一化后的内容模型（列表、详情、阅读页、分类、搜索、出流入口）。
>
> **本仓不含任何内容源、站点实现或内容策略。** 这里只有运行时、`lingshu` 命令行、跨端契约、契约门与插件开发技能包；
> 没有内置插件、没有站点清单、没有默认内容流，也不对插件访问什么站点做任何筛选。
>
> **沙箱不是安全边界。** `node:vm` 的上下文与宿主共享同一个 V8 堆，原型链逃逸
> （`this.constructor.constructor('return process')()`）与动态 `import()` 都是已知逃逸路径。沙箱的用途是
> **开发期隔离与危险 API 屏蔽**（`require` / `process` / `fs` / 定时器一律置 `undefined`），
> **不是**用来执行不可信代码的隔离手段。请勿运行来源不可信的插件；确需隔离请改用真正的隔离运行时
> （独立进程 / 容器、`isolated-vm`、JavaScriptCore 等）。
>
> **插件由第三方提供。** 你加载的每一个插件都来自他人。本项目不提供、不托管、不审核、不背书，
> 也不对插件内容、插件访问的站点、或你如何使用其结果承担任何责任。运行前请自行审阅插件。

## 本仓内容

| 路径 | 是什么 |
| --- | --- |
| `src/` | 运行时与 `lingshu` 命令行：`node:vm` 沙箱、`$lib` 注入、插件加载器、各命令 |
| `assets/js-lib/` | 注入沙箱的第三方库（`cheerio`、`dayjs`、`CryptoJS` 等） |
| `contracts/` | 唯一事实源：卡片 DSL JSON Schema、`$lib` 接口清单、跨端 conformance 语料 |
| `scripts/contract-gates/` | 四道契约门（见[契约与门禁](#契约与门禁)） |
| `skills/lingshu-plugin-dev/` | 插件开发技能包：开发流程、`$lib` 参考、卡片 DSL 参考、插件模板 |
| `docs/` | 宿主侧文档：编程式 API、fixture 形态、二进制 HTTP、挑战错文案 |
| `AGENTS.md` | 宿主侧工程笔记：沙箱语义、动作分派、fixture 形态、红线清单 |

本仓是同一项目多个公开快照之一（运行时 / Web 调试台 / 示例插件 / iOS 宿主），见[相关仓库](#相关仓库)。

## 环境要求

- **Node.js ≥ 18**（推荐 Node 20 LTS）
- npm

## 快速开始

第三方插件开发者**无需克隆本仓**。全局安装运行时，在任意空目录开发：

```bash
npm i -g lingshu-runtime
lingshu --version          # 确认全局 CLI 就绪
mkdir my-plugins && cd my-plugins
lingshu init <plugin-id>   # 生成 <plugin-id>.plugin.js + _fixtures/<plugin-id>/
lingshu test <plugin-id> --dir .
```

开发技能包（开发流程、`$lib` 参考、卡片 DSL 参考、插件模板）随本包发布，
位置在 [`skills/lingshu-plugin-dev/`](skills/lingshu-plugin-dev)，
用 CLI 自己装进 agent 配置（无需另装 installer）：

```bash
lingshu skill install          # 全局，全部 agent（claude/cursor/codex/agents）
lingshu skill install --project --agent claude   # 或：只装当前项目、只给一家
```

若要看源码再克隆本仓：

```bash
git clone https://github.com/kongtong9527/lingshu-runtime.git
cd lingshu-runtime
npm ci                   # 若你的检出没有 lockfile，改用 npm install
npm run build            # tsc → dist/
node dist/index.js --help
```

`npm run build` 把 TypeScript 编译到 `dist/`。构建产物**有意不入库**，所以新克隆的仓库必须先构建，
命令行与契约门才能跑起来。

### 运行插件

本仓**不带任何插件**。请用 `--dir` 指向你自己获得的 `.plugin.js` 目录（想自己写插件见
[`skills/lingshu-plugin-dev/`](skills/lingshu-plugin-dev)）：

```bash
# 列出某目录下的插件
node dist/index.js list --dir /path/to/plugins

# 跑一个动作；target 在 detail/reading/play 下是 URL，在 search 下是查询词
node dist/index.js run example-plugin list --dir /path/to/plugins
node dist/index.js run example-plugin detail https://example.com/post/1 --dir /path/to/plugins
node dist/index.js run example-plugin search "example query" --dir /path/to/plugins

# 校验插件的元数据头与导出方法签名
node dist/index.js test example-plugin --dir /path/to/plugins

# 递归验证插件的导航树，并确认每个叶子目录页仍能出条目
node dist/index.js listings example-plugin --dir /path/to/plugins
```

`--dir` 可以省略：省略时依次回退到 `../lingshu-plugins`、`./lingshu-plugins`、当前工作目录。
只有显式传 `--dir` 才不会意外读到无关目录，所以上面的例子一律显式传。

等价写法：`npm run lingshu -- list --dir /path/to/plugins`；把本包装成依赖后也可以直接用 `lingshu` 这个 bin。
全局安装（`npm i -g lingshu-runtime`）后 `lingshu` 与 `lingshu-runtime` 两个命令都可用
（所以 `npx lingshu-runtime list --dir .` 也成立）。

### 离线模式（`--fixture`）

`--fixture` 用本地快照替代网络请求，是插件开发与回归测试的确定性手段：

- `--fixture <文件>`：**所有**请求都返回同一份快照正文（单跳动作够用）。
- `--fixture <目录>`：目录内有 `index.json`，其 `routes` 把请求 URL 逐条映射到快照文件（可按请求头分流）；
  未命中的请求**显式报错**，而不是静默拿到错误正文——多跳动作必须用这种形态。

```bash
node dist/index.js run example-plugin list   --dir /path/to/plugins --fixture /path/to/fixture/list.html
node dist/index.js run example-plugin detail https://example.com/post/1 \
  --dir /path/to/plugins --fixture /path/to/fixture/          # 目录形态
```

### 命令一览

| 命令 | 做什么 | 常用选项 |
| --- | --- | --- |
| `list` | 列出插件目录下的插件 | `--dir` |
| `run <plugin-id> <action> [target]` | 运行一个插件动作 | 见下表 |
| `test <plugin-id>` | 校验元数据头与导出方法签名 | `--dir` |
| `listings <plugin-id>` | 递归验证导航树（分组、叶子、筛选、tags/explore 叶子） | `--dir`、`--fixture` |

`run` 的动作：`list`、`detail`、`search`、`reading`、`play`、`categories`、`listings`、`explore`、`tags`、
`setting-action`、`login`、`logout`、`me`、`invoke`。

`run` 的选项：

| 选项 | 含义 |
| --- | --- |
| `--dir <path>` | 插件目录（见上） |
| `--page <n>` / `--cursor <token>` | `list` / `search` / `tags` 的分页 |
| `--category <filter>` | 筛选组合串，如 `region=cn&type=hot` |
| `--url <url>` | `list` 的页面通道；`explore` 的探索页标识 |
| `--channel <id>` | 列表通道标识，原样透传给插件（`PluginContext.channel`） |
| `--fixture <path>` | 本地快照（文件或目录） |
| `--settings <json>` | 用户偏好，注入为 `$lib.settings` |
| `--params <json>` | 通用调用参数（`invoke`） |
| `--inputs <json>` | 登录表单输入（`login`） |

退出码：成功为 `0`。插件遭遇反爬挑战而运行时没有浏览器通道时，会如实抛出 `CHALLENGE` 并非零退出——
这是纯 Node 运行时的既定行为，不是缺陷（离线验证请走 `--fixture`）。

## 契约与门禁

`contracts/` 是 Node 运行时、Web 调试台与 Swift（iOS）宿主三方共享的唯一事实源：卡片 DSL schema、
`$lib` 签名清单、跨端 conformance 语料。`scripts/contract-gates/` 的四道门负责钉死三方不漂移：

```bash
npm run build                              # 门 2/门 3 消费 dist/
node scripts/contract-gates/run.mjs        # 门 0 命名 · 门 1 字段集合 · 门 2 $lib 签名 · 门 3 conformance 语料
npm run contract:check                     # 同上，含前置构建（别名定义在 package.json 里）
```

三方各是什么、每道门钉死什么，见 [`contracts/README.md`](contracts/README.md)。

几个容易踩错的点：

- **本仓不存在的腿会「跳过并汇报」，这是设计如此。** 门 1、门 2 还要与 Swift 宿主
  （`CardModels.swift`、`$lib` 桥）比对，门 3 的语料由 iOS 测试包执行——那些文件在 iOS 仓
  （另一个独立快照）。本仓没有 Swift 文件。
- **不要在本仓设 `CONTRACT_REQUIRE_ALL=1`。** 那个变量的含义是「三方必须齐备」，只有上游开发仓
  （Swift 宿主同树）才该设；在本仓设它会把「已跳过某条腿」的汇报变成失败。
- 门 3 另有一条**字段覆盖率**断言：schema 声明过的每个字段都必须被某条合法语料真实用到——
  加字段不补语料是失败，不是警告。
- 语料的 `expect.counts` 用 `node scripts/contract-gates/conformance.mjs --record` 维护（只补缺失值，
  CI 不得使用）。

## 作为库使用

`package.json` 把 `dist/lib.js`（含 `dist/lib.d.ts`）作为包入口导出，宿主可以直接复用运行引擎与卡片 DSL 校验器，
不必自己再实现一套：

```ts
import { executeRun, loadPlugin, validateCardDSL, shouldFallbackCard } from 'lingshu-runtime'
```

该入口导出：运行引擎（`executeRun`、`resolvePluginDir`、`findPluginFile`）、插件加载器
（`loadPlugin`、`parsePluginMeta`）、卡片 DSL 校验器（`validateCardDSL`、`shouldFallbackCard`、`CARD_LIMITS`）
以及宿主侧的挑战错工具；契约类型从 `src/types.ts` 整体转发（`export type *`）。
注意 `dist/` 由 `src/` 构建（`npm run build`），消费方拿到的必须是构建过的包。

从 npm 安装即可：`npm i lingshu-runtime`。想改运行时本体的话，构建本仓后依赖该目录，或用锁定到
release tag 的 git 依赖。

发版**在 CI 里做**，不在本机：`.github/workflows/release.yml` 走 npm 的
[trusted publishing](https://docs.npmjs.com/trusted-publishers)（OIDC，全程没有 token），
构建来源证明（provenance）自动生成。包版本就是**运行时契约版本**，由契约门锁死在「契约 ↔ 本包 ↔
iOS 宿主」三处——见 [`contracts/lib-api.md`](contracts/lib-api.md) §0。

## 安全

沙箱是开发辅助，**不是安全边界**——威胁模型与漏洞上报流程见 [SECURITY.md](SECURITY.md)。
运行非自己编写的插件之前请先读一遍。

## 许可

MIT，见 [LICENSE](LICENSE)。随仓分发的第三方库及其许可见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

## 贡献

欢迎 issue 与 PR，动手前请先读 [CONTRIBUTING.md](CONTRIBUTING.md)。要点：本仓是上游开发仓的**发布快照**；
CI 文件由上游模板注入，**不要在本仓直接改**；PR 必须回流到上游才能在后续快照里生效。
提交请带 DCO 签名（`git commit -s`），本项目不采用 CLA。

## 相关仓库

| 仓库 | 是什么 |
| --- | --- |
| [`kongtong9527/lingshu-devconsole`](https://github.com/kongtong9527/lingshu-devconsole) | Web 调试台：可视化跑插件、请求追踪、预览与播放诊断 |
| [`kongtong9527/lingshu-plugins`](https://github.com/kongtong9527/lingshu-plugins) | 少量「教材级」示例插件与 manifest |
| `lingshu-ios` | SwiftUI + JavaScriptCore 宿主，在设备上跑同一份 `.plugin.js`（**源码暂未公开**） |

每个仓库都是独立快照、各自持有许可；它们都不含任何内容源。

---

快照：`2026-10-20` · 快照 tag `v0.1.20`
