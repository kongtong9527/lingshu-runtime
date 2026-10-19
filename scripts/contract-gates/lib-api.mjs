// 门 2 · $lib 签名门：contracts/lib-api.json ↔ Node 实跑（createSandbox().$lib） ↔ iOS 桥静态抽取。
//
// 为什么需要它：同一份 $lib 契约有三处独立实现（Node 沙箱 / iOS JavaScriptCore 桥 / 库注册表），
// 曾经出过「单位秒/毫秒」「方法名漏桥」这类静默缺陷——插件调用返回 undefined，不崩不报错。
// 本门把「函数名 + 参数个数 + 库注册表」钉死；参数对象内部字段不在此门（见 contracts/lib-api.md §0）。
//
// 三条腿：
//   L1 Node  —— import runtime/dist/sandbox.js，真跑 createSandbox()，反射 $lib 的键名/方法名/fn.length
//   L2 iOS   —— 静态抽取：RunEngine.makeLib 的命名空间键、各桥 setObject(_, forKeyedSubscript:) 的键
//                与对应 @convention(block) 形参个数、libRegistry/libKeys 注册表
//   L3 文档—— contracts/lib-api.md 必须逐个提到 json 里声明的每个 `$lib.<ns>.<method>`
//   L4 版本—— **两条号段**：契约版本（`contractVersion`，只随注入面递增，插件 `minRuntimeVersion` 的基准）
//                ↔ iOS 常量（恒等）/ runtime 包版本（只要求 ≥，见下面 L4 段与内部设计记录）
//                另含**注入面指纹**：改了面就必须做一次显式的版本决定（递增契约版本或刷新指纹）
//
// 用法：node scripts/contract-gates/run.mjs（本文件是库，无 CLI 入口；L1 需要先 npm run -w runtime build）
//       node scripts/contract-gates/run.mjs --record-surface-hash   # 只刷新注入面指纹，CI 不得带

import { PATHS, ROOT, REQUIRE_ALL, createReport, layoutCandidates, readJSON, readText, resolveLayout } from './lib.mjs'
import { existsSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const CONTRACT = 'contracts/lib-api.json'
const MD = 'contracts/lib-api.md'
const SANDBOX_DIST = resolveLayout(PATHS.sandboxDist) ?? PATHS.sandboxDist[0]
const RUN_ENGINE = resolveLayout(PATHS.runEngine)

/**
 * 参数总数。两侧都用「总数」而不是「必填数」：
 * Node 侧 `fn.length` = 首个带 JS 默认值的形参之前的个数，本仓实现刻意不给可选参数写默认值
 * （可选性靠 `??`/判空表达），故 `fn.length` == 参数总数；Swift 桥一律全参收下，形参个数 == 总数。
 * 这条「不给可选参数写 JS 默认值」本身就是契约的一部分——写了会让两侧口径不再可比（见 lib-api.md §0）。
 */
const paramCount = (params) => params.length

/** 从 Swift 源码里抽 `键名 → 形参个数`：`let xBlock: @convention(block) (A, B) -> R` + `setObject(xBlock, forKeyedSubscript: "k")` */
function swiftBlocks(text) {
  const blocks = new Map()   // 变量名 → 形参个数
  const decl = /let\s+(\w+)\s*:\s*@convention\(block\)\s*\(([^)]*)\)\s*->/g
  for (const m of text.matchAll(decl)) {
    const params = m[2].trim() === '' ? [] : m[2].split(',').map(s => s.trim()).filter(Boolean)
    blocks.set(m[1], params.length)
  }
  const out = new Map()      // 线上键名 → { arity, ident }
  const set = /setObject\(\s*(\w+)\s*,\s*forKeyedSubscript:\s*"([^"]+)"/g
  for (const m of text.matchAll(set)) {
    const [, ident, key] = m
    if (blocks.has(ident)) out.set(key, { arity: blocks.get(ident), ident })
    else out.set(key, { arity: null, ident })
  }
  return out
}

/**
 * 取 Swift 某个 func 的**函数体**文本（花括号配平）。
 * 必须按函数切分——`settings`/`util` 的桥与 `makeConsole`/`loadLib` 同在 RunEngine.swift，
 * 全文扫描会把别人的键混进来（实测「多 module, randomUUID, log, warn, error」）。
 */
function swiftFuncBody(text, name) {
  const start = text.indexOf(`func ${name}(`)
  if (start < 0) return null
  const open = text.indexOf('{', start)
  if (open < 0) return null
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(open, i + 1)
    }
  }
  return null
}

/** 抽 `let x = [...]` 数组字面量里的字符串（libKeys 用） */
function swiftStringArray(text, name) {
  const m = new RegExp(`let\\s+${name}\\s*=\\s*\\[([^\\]]*)\\]`).exec(text)
  if (!m) return null
  return [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1])
}

/** 抽 Swift libRegistry：LibEntry(file:name:kind:requires:) */
function swiftRegistry(text) {
  const out = []
  const re = /LibEntry\(\s*file:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*kind:\s*\.(\w+)\(?\s*([^)]*)\)?\s*,\s*requires:\s*\[([^\]]*)\]\s*\)/g
  for (const m of text.matchAll(re)) {
    const [, file, name, kind, arg, requires] = m
    const entry = { file, name, kind, requires: [...requires.matchAll(/"([^"]+)"/g)].map(x => x[1]) }
    if (kind === 'call') entry.fn = arg.replace(/[",]/g, '').replace(/fn:\s*/, '').trim()
    if (kind === 'globals') entry.globals = [...arg.matchAll(/"([^"]+)"/g)].map(x => x[1])
    out.push(entry)
  }
  return out
}

/** 抽 TS/JS 注册表：{ file: 'x', name: 'y', strategy: { kind: 'umd' } } / { kind: 'call', fn: 'z' } / { kind: 'globals', globals: ['KJUR'] } */
function tsRegistry(text) {
  const out = []
  const re = /\{\s*file:\s*'([^']+)',\s*name:\s*'([^']+)',\s*strategy:\s*\{([^}]*)\}\s*\}/g
  for (const m of text.matchAll(re)) {
    const [, file, name, strat] = m
    const kind = /kind:\s*'(\w+)'/.exec(strat)?.[1]
    const entry = { file, name, kind }
    const fn = /fn:\s*'([^']+)'/.exec(strat)?.[1]
    if (fn) entry.fn = fn
    const globals = [...strat.matchAll(/globals:\s*\[([^\]]*)\]/g)].flatMap(x => [...x[1].matchAll(/'([^']+)'/g)].map(y => y[1]))
    if (globals.length) entry.globals = globals
    const requires = [...strat.matchAll(/requires:\s*\[([^\]]*)\]/g)].flatMap(x => [...x[1].matchAll(/'([^']+)'/g)].map(y => y[1]))
    entry.requires = requires
    out.push(entry)
  }
  return out
}

const libKey = (e) => `${e.file}|${e.name}|${e.kind}|${e.fn ?? ''}|${(e.globals ?? []).join(',')}|${(e.requires ?? []).join(',')}`

// ─────────────────────────── L4 用的两个小工具 ───────────────────────────

/**
 * 语义化版本比较（只比 `major.minor.patch` 三元组）。返回 -1/0/1；任一侧解析不出返回 null。
 * 预发布后缀（`1.0.3-rc.1`）不进比较，由调用方另判（见 L4 的「包版本不得是契约版本的预发布版」）。
 */
function compareSemver(a, b) {
  const parse = (s) => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s))
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
  }
  const x = parse(a), y = parse(b)
  if (!x || !y) return null
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1
  return 0
}

/**
 * **注入面指纹**：把契约里「插件真能调到的东西」规范化成一个稳定字符串再哈希。
 *
 * 为什么要它：契约版本与包版本解耦之后（内部设计记录），「每次发布都推着契约版本走」这个**偶然的**
 * 保护就没了——加了/删了一个 `$lib` 方法而契约版本没动，门 2 的 L1/L2/L3 全都是绿的（它们查的是
 * 「三处一致」，不是「面变没变」）。删掉一个方法而不动契约版本最致命：插件声明的 `minRuntimeVersion`
 * 会变成一句谎话（宿主报的版本比它实际提供的能力新），装上去在运行期炸。
 * 指纹把这件事变成**显式决定**：面变了就必须二选一——递增 `contractVersion`（语义变了），
 * 或刷新 `surfaceHash`（只是措辞/顺序修订，语义未变）。两条路都要在 diff 里留下痕迹。
 *
 * 进指纹的：命名空间方法名、参数**个数与顺序**（位置参数）、返回语义、`console` 方法、屏蔽全局名单、
 * 库注册表（file/name/策略/fn/globals/requires）。
 * 不进指纹的：`impl` / `swift.file` / `swift.entry`（实现落点，重构会动、契约没变）、`note` 等散文。
 * 集合语义的数组（`console.methods`、`blockedGlobals.names`、库的 `globals`）排序后入指纹——
 * 调换它们的顺序不是契约变更；而 `params` / `requires` / `entries` 的顺序**是**语义，保持原样。
 */
function canonicalSurface(contract) {
  const ns = {}
  for (const name of Object.keys(contract.namespaces ?? {}).sort()) {
    const methods = {}
    for (const m of Object.keys(contract.namespaces[name].methods ?? {}).sort()) {
      const spec = contract.namespaces[name].methods[m]
      methods[m] = { params: spec.params ?? [], returns: spec.returns ?? null }
    }
    ns[name] = methods
  }
  const globals = {}
  for (const g of Object.keys(contract.globals ?? {}).sort()) {
    const spec = contract.globals[g]
    globals[g] = { methods: [...(spec.methods ?? [])].sort(), arityChecked: spec.arityChecked ?? null }
  }
  return JSON.stringify({
    globals,
    blockedGlobals: [...(contract.blockedGlobals?.names ?? [])].sort(),
    namespaces: ns,
    libraries: (contract.libraries?.entries ?? []).map(e => ({
      file: e.file, name: e.name, kind: e.kind, fn: e.fn ?? null,
      globals: e.globals ? [...e.globals].sort() : null, requires: e.requires ?? [],
    })),
  })
}

const surfaceHash = (contract) => `sha256:${createHash('sha256').update(canonicalSurface(contract)).digest('hex')}`

export async function runLibApiGate({ recordSurfaceHash = false } = {}) {
  const report = createReport('门 2 · $lib 签名门（lib-api.json ↔ Node 实跑 ↔ iOS 桥）')
  const contract = readJSON(CONTRACT)
  const namespaces = contract.namespaces ?? {}
  const libs = contract.libraries?.entries ?? []
  const declaredNames = new Set([...Object.keys(namespaces), ...libs.map(l => l.name)])

  // ── L1 Node 实跑 ─────────────────────────────────────────────
  const distAbs = join(ROOT, SANDBOX_DIST)
  if (!existsSync(distAbs)) {
    report.fail('L1 Node · runtime/dist 存在', `缺 ${SANDBOX_DIST} —— 先跑 ${PATHS.buildHint}`)
  } else {
    const { createSandbox } = await import(pathToFileURL(distAbs).href)
    const sandbox = createSandbox()
    const $lib = sandbox.$lib
    report.sameSet(Object.keys($lib), declaredNames, 'L1 Node · $lib 顶层键名 ↔ 契约')
    for (const [ns, spec] of Object.entries(namespaces)) {
      const actual = $lib[ns]
      if (!actual || typeof actual !== 'object') {
        report.fail(`L1 Node · $lib.${ns}`, '未注入')
        continue
      }
      report.sameSet(Object.keys(actual), Object.keys(spec.methods), `L1 Node · $lib.${ns} 方法集合 ↔ 契约`)
      for (const [m, sig] of Object.entries(spec.methods)) {
        const fn = actual[m]
        if (typeof fn !== 'function') { report.fail(`L1 Node · $lib.${ns}.${m}`, '不是函数'); continue }
        report.expect(fn.length === paramCount(sig.params), `L1 Node · $lib.${ns}.${m} 必填参数个数`,
          `契约 ${paramCount(sig.params)} 个参数（${sig.params.join(', ')}），实现 fn.length=${fn.length}` +
          (fn.length < paramCount(sig.params) ? '（是否给可选参数写了 JS 默认值？`fn.length` 会被截断）' : ''))
      }
    }
    // 屏蔽全局：查**沙箱全局**（不是 $lib —— `$lib.Buffer` 是合法的第三方库键）
    const blocked = contract.blockedGlobals?.names ?? []
    const leaked = blocked.filter(k => sandbox.runInContext(`typeof ${k}`) !== 'undefined')
    report.expect(leaked.length === 0, 'L1 Node · 危险全局已屏蔽', leaked.length ? `沙箱可见：${leaked.join(', ')}` : `${blocked.length} 个已屏蔽`)
    // 外部库键：只查键名（面由上游决定）
    for (const l of libs) {
      report.expect($lib[l.name] !== undefined, `L1 Node · $lib.${l.name} 已注入`, typeof $lib[l.name])
    }
    // 注册表（TS 侧）
    const loaderPath = resolveLayout(layoutCandidates(contract.libraries.runtimeRegistry.file))
    const loaderSrc = loaderPath ? readText(loaderPath) : null
    if (!loaderSrc) report.fail('L1 Node · lib-loader.ts 可读', `${contract.libraries.runtimeRegistry.file}（候选：${layoutCandidates(contract.libraries.runtimeRegistry.file).join('、')}）`)
    else {
      const reg = tsRegistry(loaderSrc)
      report.sameSet(reg.map(libKey), libs.map(libKey), 'L1+L2 · 库注册表 ↔ 契约（file/name/策略/依赖）')
    }
  }

  // ── L2 iOS 静态抽取 ─────────────────────────────────────────
  const engineSrc = RUN_ENGINE ? readText(RUN_ENGINE) : null
  if (!engineSrc) {
    if (REQUIRE_ALL) report.fail('L2 iOS · RunEngine.swift 可读', `缺 ${PATHS.runEngine[0]}`)
    else report.note(`缺 ${PATHS.runEngine[0]} → 跳过 iOS 腿（公开 runtime 仓正常态）`)
  } else {
    const makeLibBody = /private func makeLib\(settings: \[String: Any\]\) -> JSValue \{([\s\S]*?)\n    \}/.exec(engineSrc)?.[1] ?? ''
    const injected = [...makeLibBody.matchAll(/forKeyedSubscript:\s*"([^"]+)"/g)].map(m => m[1])
    const libKeys = swiftStringArray(engineSrc, 'libKeys') ?? []
    report.sameSet([...injected, ...libKeys], declaredNames, 'L2 iOS · makeLib 注入键名 ↔ 契约')

    for (const [ns, spec] of Object.entries(namespaces)) {
      const file = spec.swift?.file ? resolveLayout(layoutCandidates(spec.swift.file)) : null
      const src = file ? readText(file) : null
      if (!src) {
        if (REQUIRE_ALL) report.fail(`L2 iOS · $lib.${ns} 桥文件`, `缺 ${file}`)
        else report.note(`缺 ${file} → 跳过 $lib.${ns} 的 iOS 腿`)
        continue
      }
      const blocks = swiftBlocks(swiftFuncBody(src, spec.swift.entry) ?? src)
      const declared = Object.keys(spec.methods)
      const found = declared.filter(m => blocks.has(m))
      const extra = [...blocks.keys()].filter(k => !declared.includes(k))
      report.sameSet([...found, ...extra], declared, `L2 iOS · $lib.${ns} 方法集合 ↔ 契约（${file.split('/').pop()}）`)
      for (const m of found) {
        const { arity, ident } = blocks.get(m)
        const total = spec.methods[m].params.length
        if (arity === null) {
          report.fail(`L2 iOS · $lib.${ns}.${m} 形参个数`, `找不到 ${ident} 的 @convention(block) 声明（句式要求见 lib-api.mjs 注释）`)
        } else {
          report.expect(arity === total, `L2 iOS · $lib.${ns}.${m} 形参个数`,
            `契约 ${total}（${spec.methods[m].params.join(', ')}），Swift ${arity}`)
        }
      }
    }
    // iOS 注册表
    const reg = swiftRegistry(engineSrc)
    report.sameSet(reg.map(libKey), libs.map(libKey), 'L2 iOS · libRegistry ↔ 契约（file/name/策略/依赖）')
    report.sameSet(libKeys, libs.map(l => l.name), 'L2 iOS · libKeys ↔ 契约库键')
  }

  // ── L3 文档 ────────────────────────────────────────────────
  const md = readText(MD)
  if (!md) report.fail('L3 文档 · lib-api.md 可读', MD)
  else {
    const tokens = new Set([...md.matchAll(/\$lib\.(\w+)\.(\w+)/g)].map(m => `${m[1]}.${m[2]}`))
    const missing = []
    for (const [ns, spec] of Object.entries(namespaces)) {
      for (const m of Object.keys(spec.methods)) if (!tokens.has(`${ns}.${m}`)) missing.push(`${ns}.${m}`)
    }
    report.expect(missing.length === 0, 'L3 文档 · 每个方法都在 lib-api.md 里出现',
      missing.length ? `漏 ${missing.join(', ')}` : `${tokens.size} 个签名`)
    const unknown = [...tokens].filter(t => {
      const [ns, m] = t.split('.')
      return !namespaces[ns]?.methods?.[m]
    })
    report.expect(unknown.length === 0, 'L3 文档 · lib-api.md 不引用未声明的方法',
      unknown.length ? `多 ${unknown.join(', ')}` : '无不一致')
  }

  // ── L4 版本（两条号段，2026-10 解耦） ────────────────────────
  //
  // 为什么单列一腿：插件 `minRuntimeVersion` 的比较基准是**运行时契约版本**，不是 App 的
  // `MARKETING_VERSION`。两套版本号不同源，一旦 iOS 侧拿错基准，整仓插件会在仓库页恒显示
  // 「不可安装」——不崩不报错，只在「装插件」这条路上静默堵死（2026-10 实测：公开插件仓
  // 3 个插件全部点不动）。
  //
  // **两条号段**（解耦前两者恒等，见内部设计记录）：
  //   · `contractVersion` = **$lib 注入面的版本**（本契约自己的版本）——只随注入面变更递增；
  //     插件 `minRuntimeVersion` 比的就是它 ⇒ **iOS 常量必须与它恒等**（一个字的差都不能有）。
  //   · `runtime/package.json` 的 `version` = **npm 包版本**——随每次发布递增（补丁、CLI 修复、
  //     文档都算），它**不是**插件最低版本要求的基准。
  // 两者关系：**包版本 ≥ 契约版本**。包可以领先（补丁不动契约面），但不得落后——落后意味着
  // 「包发出去了，却少注入一个契约声明过的方法」。
  //
  // 解耦前「包版本 = 契约版本」把任何 runtime 补丁都推着契约版本走（1.0.0 → 1.0.1 → 1.0.2 两次
  // 都只为发一个 CLI 版本号修复），契约版本这个语义被磨成了「包版本的别名」。
  const pkgPath = resolveLayout(layoutCandidates(PATHS.runtimePackage[0]))
  const pkg = pkgPath ? JSON.parse(readText(pkgPath)) : null
  const contractVersion = contract.contractVersion
  const contractOk = typeof contractVersion === 'string' && /^\d+\.\d+\.\d+$/.test(contractVersion)
  if (!contractOk) {
    report.fail('L4 版本 · 契约声明 contractVersion', `${CONTRACT} 缺 contractVersion 或不是 semver 三元组（现值 ${JSON.stringify(contractVersion)}）`)
  }
  if (!pkg) {
    report.fail('L4 版本 · runtime/package.json 可读', `候选：${layoutCandidates(PATHS.runtimePackage[0]).join('、')}`)
  } else if (contractOk) {
    const rel = compareSemver(pkg.version, contractVersion)
    report.expect(rel !== null && rel >= 0, 'L4 版本 · 包版本 ≥ 契约版本',
      rel === null
        ? `包版本不是 semver：${JSON.stringify(pkg.version)}`
        : `包 ${pkg.version}，契约 ${contractVersion}（包不得落后于契约：落后 = 发布了却少注入一个方法）`)
    // `1.0.3-rc.1` 的三元组等于 `1.0.3`，但它**不是** `1.0.3`（预发布 < 正式）。契约声明的是正式版，
    // 就不能拿它的预发布版当宿主。
    if (rel === 0 && String(pkg.version).includes('-')) {
      report.fail('L4 版本 · 包版本不得是契约版本的预发布版',
        `包 ${pkg.version} 是 ${contractVersion} 的预发布版，而契约声明的是正式版`)
    }
  }
  // 注入面指纹：面变了必须做一次显式版本决定（理由与口径见 surfaceHash 的注释）
  const actualSurface = surfaceHash(contract)
  if (recordSurfaceHash) {
    if (contract.surfaceHash === actualSurface) {
      report.pass('L4 版本 · 注入面指纹已刷新', `无变化（${actualSurface.slice(0, 23)}…）`)
    } else {
      const before = contract.surfaceHash ?? '（原缺）'
      contract.surfaceHash = actualSurface
      writeFileSync(join(ROOT, CONTRACT), JSON.stringify(contract, null, 2) + '\n')
      report.pass('L4 版本 · 注入面指纹已刷新', `写入 ${CONTRACT}：${String(before).slice(0, 23)}… → ${actualSurface.slice(0, 23)}…`)
      report.note('--record-surface-hash 是「面变了但语义未变」的声明；若本次是契约面变更，' +
        '请改为递增 contractVersion（并同步 iOS 常量）后重跑门')
    }
  } else if (typeof contract.surfaceHash !== 'string' || !contract.surfaceHash) {
    report.fail('L4 版本 · 契约声明 surfaceHash', `缺 surfaceHash —— 跑 node scripts/contract-gates/run.mjs --record-surface-hash 补上`)
  } else {
    report.expect(contract.surfaceHash === actualSurface, 'L4 版本 · 注入面指纹 ↔ surfaceHash',
      contract.surfaceHash === actualSurface
        ? `面未变（${actualSurface.slice(0, 23)}…）`
        : `注入面变了（契约 ${contract.surfaceHash.slice(0, 23)}… → 实际 ${actualSurface.slice(0, 23)}…）：` +
          '是契约面变更就递增 contractVersion，只是措辞/顺序修订就跑 node scripts/contract-gates/run.mjs --record-surface-hash')
  }
  const contractSwift = resolveLayout(PATHS.pluginRuntimeContract)
  const contractSrc = contractSwift ? readText(contractSwift) : null
  if (!contractSrc) {
    if (REQUIRE_ALL) report.fail('L4 版本 · PluginRuntimeContract.swift 可读', `缺 ${PATHS.pluginRuntimeContract[0]}`)
    else report.note(`缺 ${PATHS.pluginRuntimeContract[0]} → 跳过 iOS 腿（公开 runtime 仓正常态）`)
  } else {
    const swiftVersion = /static let version\s*=\s*"([^"]+)"/.exec(contractSrc)?.[1] ?? null
    if (!swiftVersion) {
      report.fail('L4 版本 · iOS 常量可抽取', `${PATHS.pluginRuntimeContract[0]} 里找不到 static let version = "…"`)
    } else {
      report.expect(swiftVersion === contractVersion, 'L4 版本 · iOS PluginRuntimeContract.version ↔ 契约 contractVersion',
        `契约 ${contractVersion}，Swift ${swiftVersion}`)
    }
  }

  report.print()
  return report
}
