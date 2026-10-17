// 契约门共享库：读文件、收集结果、TS/Swift 字段集合抽取。
// 设计口径：**字段集合**指「该容器在线上 JSON 里允许出现的键名」。
// 三方 = contracts/card-dsl.schema.json（发布契约）/ runtime/src/types.ts（Node 侧）/
// ios/**/*.swift（iOS 侧）。取值合法性与容差回退**不**在字段集合门的职责内（由 conformance 语料门管）。

import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 被检查的仓根。缺省 = 本脚本所在仓（`scripts/contract-gates/` 上两级）。
 * `CONTRACT_ROOT=<dir>` 可指向别处——发布脚本用它对**发布快照**跑门（复用母仓已装的 node_modules，
 * 免得为跑门在快照里 npm ci 一遍）。
 */
export const ROOT = process.env.CONTRACT_ROOT ? resolve(process.env.CONTRACT_ROOT) : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 三方比对是否强制齐备（母仓 CI 置 1；公开仓只有其中一部分文件，缺的那条腿跳过） */
export const REQUIRE_ALL = process.env.CONTRACT_REQUIRE_ALL === '1'

/** 是否母仓布局（有 workspaces 的根 package.json）——公开 runtime 仓里 `runtime/` 就是仓根 */
export function isMonorepo() {
  const pkg = readJSON('package.json')
  return Array.isArray(pkg.workspaces) && pkg.workspaces.length > 0
}

/**
 * 布局无关取径：母仓 `runtime/src/types.ts` ↔ 公开 runtime 仓 `src/types.ts`。
 * 返回第一个存在的相对路径，都不存在则返回 null（调用方决定「缺腿跳过」还是失败）。
 */
export function resolveLayout(candidates) {
  for (const rel of candidates) {
    if (existsSync(join(ROOT, rel))) return rel
  }
  return null
}

/**
 * 由契约里声明的**母仓路径**推出各布局候选：母仓 `runtime/src/x` ↔ 公开仓仓根 `src/x`
 * （devconsole/ios 同理）。契约文件里写的是母仓路径（它要能同时服务两种布局），
 * 所以任何读契约声明路径的地方都必须过这个函数，否则公开仓会「文件明明在却报缺」。
 */
export function layoutCandidates(declared) {
  const out = [declared]
  for (const prefix of ['runtime/', 'devconsole/', 'ios/', 'lingshu-plugins/', 'lingshu-skills/lingshu-plugin-dev/']) {
    if (declared.startsWith(prefix)) out.push(declared.slice(prefix.length))
  }
  return [...new Set(out)]
}

/** 常用落点（母仓优先；公开仓为仓根形态） */
export const PATHS = {
  types: ['runtime/src/types.ts', 'src/types.ts'],
  cardModels: ['ios/Lingshu/Models/CardModels.swift'],
  lingshuModels: ['ios/Lingshu/Models/LingshuModels.swift'],
  sandboxDist: ['runtime/dist/sandbox.js', 'dist/sandbox.js'],
  cardDslDist: ['runtime/dist/card-dsl.js', 'dist/card-dsl.js'],
  runEngine: ['ios/Lingshu/Runtime/RunEngine.swift'],
  libLoader: ['runtime/src/lib-loader.ts', 'src/lib-loader.ts'],
  runtimePackage: ['runtime/package.json', 'package.json'],
  pluginRuntimeContract: ['ios/Lingshu/Runtime/PluginRuntimeContract.swift'],
  buildHint: 'npm run -w runtime build（母仓）/ npm run build（公开仓）',
}

export function readText(rel) {
  const abs = join(ROOT, rel)
  if (!existsSync(abs)) return null
  return readFileSync(abs, 'utf8')
}

export function readJSON(rel) {
  const text = readText(rel)
  if (text === null) throw new Error(`缺少文件：${rel}`)
  return JSON.parse(text)
}

/** 门的结果收集器：把每条检查记下来，最后统一汇报并决定退出码 */
export function createReport(title) {
  const checks = []
  /** @param {{ok:boolean, name:string, detail?:string}} c */
  const add = (c) => checks.push(c)
  return {
    pass(name, detail) { add({ ok: true, name, detail }) },
    fail(name, detail) { add({ ok: false, name, detail }) },
    /** 断言：cond 为假即失败 */
    expect(cond, name, detail) { add({ ok: !!cond, name, detail }) },
    /** 集合相等断言，失败时打印两个方向的差集 */
    sameSet(actual, expected, name) {
      const a = new Set(actual), e = new Set(expected)
      const missing = [...e].filter(x => !a.has(x))
      const extra = [...a].filter(x => !e.has(x))
      if (missing.length === 0 && extra.length === 0) {
        add({ ok: true, name, detail: `${e.size} 个字段一致` })
      } else {
        const parts = []
        if (missing.length) parts.push(`缺 ${missing.join(', ')}`)
        if (extra.length) parts.push(`多 ${extra.join(', ')}`)
        add({ ok: false, name, detail: parts.join('；') })
      }
    },
    notes: [],
    note(text) { this.notes.push(text) },
    checks,
    get failed() { return checks.filter(c => !c.ok) },
    print() {
      console.log(`\n══ ${title} ══`)
      for (const c of checks) {
        const mark = c.ok ? '✓' : '✗'
        console.log(`  ${mark} ${c.name}${c.detail ? ` —— ${c.detail}` : ''}`)
      }
      for (const n of this.notes) console.log(`  · ${n}`)
      console.log(`  ${this.failed.length === 0 ? '全部通过' : `${this.failed.length} 项失败`}（共 ${checks.length} 项）`)
    },
  }
}

// ─────────────────────────── TS 侧（types.ts 的 AST） ───────────────────────────

let tsModule = null
/**
 * 解析 `typescript`（只用于把 `types.ts` 读成 AST）。
 * 解析基点必须**从门脚本自身位置**出发——`CONTRACT_ROOT` 可能指向发布快照（那里没有 node_modules，
 * 甚至没有 `runtime/` 目录），而门脚本所在仓一定有（`npm ci` 装的）。母仓/公开仓两种布局都能命中。
 */
function loadTS() {
  if (tsModule) return tsModule
  const bases = [
    fileURLToPath(import.meta.url),          // 门脚本自身 → 其所在仓的 node_modules
    join(ROOT, 'package.json'),              // 被检查仓根（单包布局）
    join(ROOT, 'runtime', 'package.json'),   // 被检查仓根（母仓 workspace 布局）
  ]
  for (const base of bases) {
    try {
      tsModule = createRequire(base)('typescript')
      return tsModule
    } catch { /* 试下一个 */ }
  }
  throw new Error('找不到 typescript（先在被检查仓或本仓跑 npm ci / npm install）')
}

/**
 * 解析 types.ts，返回 { interfaces: Map<name, string[]>, unions: Map<name, Array<{disc, fields}>> }。
 * - interface / type 字面量对象 → interfaces（字段名数组，含索引签名标记 `*`）
 * - 联合类型（每支是对象字面量）→ unions（按判别字段的字面量取值分组）
 * - 带类型引用的联合支（如 CardTarget 里的 PageJumpTarget）→ 记 `@ref:<name>`
 */
export function parseTypescript(rel) {
  const ts = loadTS()
  const text = readText(rel)
  if (text === null) return null
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.ES2022, true)

  const interfaces = new Map()
  const required = new Map()
  const unions = new Map()
  const refs = new Map()   // name → 引用的类型名数组（联合支里的裸引用）

  const fieldsOfTypeLiteral = (node) => {
    const out = []
    const req = []
    for (const m of node.members ?? []) {
      if (ts.isPropertySignature(m) && m.name) {
        const name = m.name.getText(sf)
        out.push(name)
        if (!m.questionToken) req.push(name)
      } else if (ts.isIndexSignatureDeclaration(m)) {
        out.push('*')   // 开放字段（`[k: string]: any`）——比对时单独处理
      }
    }
    return { fields: out, required: req }
  }

  const discOf = (node) => {
    for (const m of node.members ?? []) {
      if (ts.isPropertySignature(m) && m.name) {
        const key = m.name.getText(sf)
        if (key !== 'type' && key !== 'kind' && key !== 'action') continue
        const t = m.type
        if (t && ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)) {
          return { key, value: t.literal.text }
        }
      }
    }
    return null
  }

  const visit = (node) => {
    if (ts.isInterfaceDeclaration(node)) {
      const { fields, required: req } = fieldsOfTypeLiteral(node)
      interfaces.set(node.name.text, fields)
      required.set(node.name.text, req)
    } else if (ts.isTypeAliasDeclaration(node)) {
      const t = node.type
      if (ts.isTypeLiteralNode(t)) {
        const { fields, required: req } = fieldsOfTypeLiteral(t)
        interfaces.set(node.name.text, fields)
        required.set(node.name.text, req)
      } else if (ts.isUnionTypeNode(t)) {
        const variants = []
        const plain = []
        for (const raw of t.types) {
          // `({kind:'pill'; …} & DualState)` 会被包成 ParenthesizedType，先剥括号
          const member = ts.isParenthesizedTypeNode(raw) ? raw.type : raw
          if (ts.isTypeLiteralNode(member)) {
            const d = discOf(member)
            const { fields, required: req } = fieldsOfTypeLiteral(member)
            variants.push({ disc: d?.value ?? null, discKey: d?.key ?? 'type', fields, required: req })
          } else if (ts.isTypeReferenceNode(member)) {
            plain.push(member.typeName.getText(sf))
          } else if (ts.isIntersectionTypeNode(member)) {
            // `({kind:'pill', ...} & DualState)`：取字面量支的字段 + 引用支名字
            const fields = []
            const req = []
            for (const sub of member.types) {
              if (ts.isTypeLiteralNode(sub)) {
                const r = fieldsOfTypeLiteral(sub)
                fields.push(...r.fields)
                req.push(...r.required)
              } else if (ts.isTypeReferenceNode(sub)) {
                plain.push(sub.typeName.getText(sf))
              }
            }
            const d = member.types.find(ts.isTypeLiteralNode)
            variants.push({ disc: d ? discOf(d)?.value ?? null : null, discKey: d ? discOf(d)?.key ?? 'kind' : 'kind', fields, required: req })
          }
        }
        unions.set(node.name.text, variants)
        if (plain.length) refs.set(node.name.text, plain)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return { interfaces, required, unions, refs }
}

/** 取某联合类型中判别值命中的那支的字段集（找不到即 null） */
export function unionVariant(parsed, typeName, discValue) {
  const variants = parsed.unions.get(typeName)
  if (!variants) return null
  const hit = variants.find(v => v.disc === discValue)
  return hit ? { fields: hit.fields, discKey: hit.discKey } : null
}

/** 取某联合类型全部支的字段并集（含一层类型引用展开） */
export function unionAllFields(parsed, typeName, depth = 2) {
  const out = new Set()
  const variants = parsed.unions.get(typeName) ?? []
  for (const v of variants) {
    for (const f of v.fields) out.add(f)
    if (v.disc) out.add(v.discKey ?? 'type')
  }
  if (depth > 0) {
    for (const ref of parsed.refs.get(typeName) ?? []) {
      if (parsed.interfaces.has(ref)) for (const f of parsed.interfaces.get(ref)) out.add(f)
      else if (parsed.unions.has(ref)) for (const f of unionAllFields(parsed, ref, depth - 1)) out.add(f)
    }
  }
  return out
}

/** interface / 类型别名 / 单支联合 一律取「字段并集」 */
export function tsFields(parsed, name) {
  if (parsed.interfaces.has(name)) return new Set(parsed.interfaces.get(name))
  if (parsed.unions.has(name)) return unionAllFields(parsed, name)
  return null
}

/** 取 interface / 类型字面量的字段集 */
export function interfaceFields(parsed, name) {
  const f = parsed.interfaces.get(name)
  return f ? new Set(f) : null
}

// ─────────────────────────── Swift 侧（CardModels.swift 等） ───────────────────────────

/**
 * 解析 Swift 文件文本，返回 { structs: Map<name, Set<field>>, enums: Map<name, Map<case, Set<label>>> }。
 * 只认两种句式（本仓 Swift 模型的固定写法，见 ios/AGENTS.md 契约同步红线）：
 *   struct X { let/var a: T  ... }
 *   enum X { case a(x: T, y: T) ... }   // 单行 case 声明
 * 解析不出即视为门失败（要求保持句式，勿改写模型文件风格）。
 */
export function parseSwift(text) {
  const structs = new Map()
  const enums = new Map()
  const lines = text.split('\n')

  // struct 体：从 `struct X ... {` 到缩进归零的 `}`
  const structRe = /^(\s*)(?:public\s+|internal\s+)?struct\s+(\w+)/
  const enumRe = /^(\s*)(?:public\s+|internal\s+)?(?:indirect\s+)?enum\s+([\w.]+)/
  const caseRe = /^\s*case\s+(\w+)\(([^)]*)\)/
  /** 体结束判据：缩进不深于声明行的 `}`（顶层 = 列 0；嵌套 struct 也认） */
  const closesAt = (line, indent) => {
    const m = /^(\s*)\}/.exec(line)
    return !!m && m[1].length <= indent
  }

  for (let i = 0; i < lines.length; i++) {
    let m
    if ((m = structRe.exec(lines[i]))) {
      const indent = m[1].length
      const name = m[2]
      const body = []
      for (let j = i + 1; j < lines.length; j++) {
        if (closesAt(lines[j], indent)) break
        body.push(lines[j])
      }
      const fields = new Set()
      for (const line of body) {
        // 只要**存储属性**：let/var 声明且同行不带 `{`（带 `{` 的是计算属性，如 `var id: String { key }`、`var isEmpty: Bool { … }`）
        if (line.includes('{')) continue
        const fm = /^\s*(?:private\s+|fileprivate\s+)?(?:let|var)\s+(\w+)\s*:/.exec(line)
        if (fm) fields.add(fm[1])
      }
      structs.set(name, fields)
    } else if ((m = enumRe.exec(lines[i]))) {
      const indent = m[1].length
      const name = m[2]
      const cases = new Map()
      for (let j = i; j < lines.length; j++) {
        if (j > i && closesAt(lines[j], indent)) break
        const cm = caseRe.exec(lines[j])
        if (cm) {
          // 关联值有标签才是字段名（`case jump(PageJumpTarget)` 这种无标签的是**类型引用**）
          const labels = new Set()
          const refs = []
          for (const part of cm[2].split(',')) {
            const t = part.trim()
            if (!t) continue
            if (t.includes(':')) labels.add(t.split(':')[0].trim())
            else refs.push(t.replace(/[?\[\]]/g, ''))
          }
          cases.set(cm[1], { labels, refs })
        }
      }
      if (cases.size) enums.set(name, cases)
    }
  }
  return { structs, enums }
}

// ─────────────────────────── schema 侧 ───────────────────────────

/** 按 JSON Pointer（`#/$defs/X`）取 schema 片段 */
export function def(schema, ref) {
  if (!ref.startsWith('#/')) throw new Error(`只支持本地 $ref：${ref}`)
  return ref.slice(2).split('/').reduce((o, k) => o[k.replace(/~1/g, '/')], schema)
}

/** 容器 → schema 字段集合：递归收集 properties 与 oneOf 各支（跨 $ref） */
export function schemaFields(schema, ref) {
  const out = new Set()
  const collect = (node) => {
    for (const k of Object.keys(node.properties ?? {})) out.add(k)
    for (const variant of node.oneOf ?? []) collect(variant.$ref ? def(schema, variant.$ref) : variant)
  }
  collect(def(schema, ref))
  if (out.size === 0) throw new Error(`schema 片段无 properties/oneOf：${ref}`)
  return out
}

/** 变体级 schema 字段集合（要求该片段自带 properties） */
export function schemaVariantFields(schema, ref) {
  const node = def(schema, ref)
  if (!node.properties) throw new Error(`schema 片段不是变体（无 properties）：${ref}`)
  return new Set(Object.keys(node.properties))
}

/** 容器的 required 集合（只用于 schema ↔ TS 之间的必填比对） */
export function schemaRequired(schema, ref) {
  const out = new Set()
  const collect = (node) => {
    for (const k of node.required ?? []) out.add(k)
    for (const variant of node.oneOf ?? []) collect(variant.$ref ? def(schema, variant.$ref) : variant)
  }
  collect(def(schema, ref))
  return out
}
