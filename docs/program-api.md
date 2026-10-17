# 编程式 API 入口（`runtime/src/lib.ts`）

`lib.ts` 是 runtime 对 **Node 宿主**的公开面（DevConsole BFF、测试脚本经它拿运行时能力与契约类型）；CLI 入口 `src/index.ts` 不经它，两者互不影响。`package.json` 的 `exports` 暴露**两个**出口：

```json
"exports": {
  ".":          { "types": "./dist/lib.d.ts",      "default": "./dist/lib.js" },
  "./card-dsl": { "types": "./dist/card-dsl.d.ts", "default": "./dist/card-dsl.js" }
}
```

## 两个出口：Node 宿主面 vs **浏览器安全面**（2026-10 补）

**包根是 Node 宿主入口，浏览器里不能用**：`dist/lib.js` 会带进 `commands/run.js` → `plugin-loader.js`
→ `runtime/storage.js` 等 Node-only 模块（`node:fs` / `node:url` / `node:vm`）。浏览器打包器
（Vite/rollup）遇到这些只会把它们 externalize 成 `__vite-browser-external`，然后在**生产构建**里报

```
"fileURLToPath" is not exported by "__vite-browser-external", imported by "…/@lingshu/runtime/dist/runtime/storage.js"
```

> 上面这行报错**逐字保留**：它是搜索键，改了后人就搜不到这条错误了。（当时的包名还是 `@lingshu/runtime`，
> 2026-10 才去掉 scope 改成 `lingshu-runtime`——原因见 docs/adr/0068 补记。）

而 `vite dev`（esbuild）能容忍 → **开发期一切正常、`vite build` 整包失败**。

**纯逻辑的契约代码一律走 `lingshu-runtime/card-dsl` 子路径**（`dist/card-dsl.js` 只 import 类型，
编译期擦除，零 Node 依赖）：`validateCardDSL` / `shouldFallbackCard` / `CARD_LIMITS`。

- **值 import 必须挑出口**：浏览器侧写 `import { shouldFallbackCard } from 'lingshu-runtime/card-dsl'`；
  Node 侧（BFF/测试）从包根拿什么都行。
- **类型 import 无所谓**（`import type { … } from 'lingshu-runtime'` 编译期擦除）。
- **新增浏览器可用的纯逻辑时，一并加子路径出口**，别让消费方被迫从包根 import。

> 2026-10 实测（这条是被公开仓 CI 抓出来的）：母仓 CI 只跑 devconsole 的 `typecheck` + `test`，
> 两者都走 esbuild、不做打包 ⇒ **`vite build` 从来没被覆盖**，包根 import 让生产构建一直是红的。
> 现在母仓 CI 也跑 `npm run -w devconsole build`（公开仓 CI 本来就跑 `npm run build`）。

## 出口政策

```ts
// 值：逐个具名导出（不 export *，避免内部实现意外成为 API）
export { executeRun, findPluginFile, resolvePluginDir } from './commands/run.js'
export { loadPlugin } from './plugin-loader.js'
export { parsePluginMeta } from './types.js'
export { isChallengeResponse as isChallengeProbe, /* … */ } from './runtime/challenge.js'
// 类型：全量转发契约（types.ts 是所有宿主的类型来源）
export type * from './types.js'
```

**契约类型一律 `export type * from './types.js'`，勿回退成手工白名单**：白名单会随 `types.ts` 增字段而漂移，且漂移只在消费方 `tsc` 时报 TS2305——vitest 不做类型检查，单测照样全绿。

2026-10 实测：`lib.ts` 的白名单漏列 `CategoryFilterDisplay` / `TagContext` / `TagResult`，DevConsole 的 `src/types.ts` 里这 3 个类型名转发不到（TS2305），而 `npm run -w devconsole test` 227 条一直是绿的。改为全量转发后零下游改动即修复（未暴露任何新错误，说明当初只是漏列、不是有意收窄）。

`types.ts` 内所有导出都是公开契约（含 `CardNode` / `CardDSL` 等卡片类型），没有仅供内部使用的类型；**新增契约类型只改 `types.ts`，本文件不需要动**。

## 消费面是 dist：改了 `src` 必须 build

`exports` 指向 `dist`，因此有两条硬约束：

- **改 `runtime/src/**` 后不 build，消费方拿到的是陈旧契约**：新增字段不报错、删掉的字段假报错、类型描述与运行时行为不一致（DevConsole 的 BFF 运行时同样走 `dist/lib.js`，不只是类型问题）。iOS 侧的同类陷阱见 `ios/docs/simulator-debugging.md`。
- **DevConsole 的 `typecheck` / `build` 已内置重建**：`npm run -w devconsole typecheck` 的第一步是 `cd ../runtime && npm run build`（`build:runtime`），所以它不会对着陈旧 `dist` 撒谎；只有手工跑 `npx tsc --noEmit` 才需要自己先 `npm run -w runtime build`。

验证顺序（离线）：

```bash
npm run -w runtime build          # 或直接跑下面一条，它会自己构建
npm run -w devconsole typecheck     # 先重建 runtime → 前端 + BFF 类型检查
```
