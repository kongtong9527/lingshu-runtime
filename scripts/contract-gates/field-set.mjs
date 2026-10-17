// 门 1 · 字段集合门：schema ↔ runtime/src/types.ts ↔ CardModels.swift 三方字段集比对。
//
// 这是「卡片 DSL 加字段三处同步」人工纪律的机器替代（根 AGENTS.md 第 8 条）：
//   · 三方字段集**完全相等**才算过——删掉一个 `CodingKeys`、schema 加了字段而 Swift 没加、
//     TS 删了字段而 iOS 还留着，三种情况都会红。
//   · 只比**字段名**；必填/可选只在 schema ↔ TS 之间比（Swift 侧刻意全量 decodeIfPresent 容差，
//     拿 Swift 可选性做门只会天天误报——见 ios/AGENTS.md「decodeIfPresent 容差」）。
//   · 取值合法性（如 aspect:'abc'）不属于本门，归 conformance 语料门。
//
// 用法：node scripts/contract-gates/field-set.mjs
// 缺 Swift 腿时跳过 Swift 比对并**显式汇报**（公开仓只有部分文件）；CONTRACT_REQUIRE_ALL=1 时缺腿即失败。

import { PATHS, REQUIRE_ALL, createReport, layoutCandidates, parseSwift, parseTypescript, readJSON, readText, resolveLayout, schemaFields, schemaRequired, schemaVariantFields, tsFields, unionAllFields, unionVariant } from './lib.mjs'

const SCHEMA = 'contracts/card-dsl.schema.json'
// 布局无关：母仓 `runtime/src/types.ts` ↔ 公开 runtime 仓 `src/types.ts`；iOS 腿只在母仓/ios 仓存在
const TYPES = resolveLayout(PATHS.types) ?? PATHS.types[0]
const CARD_MODELS = resolveLayout(PATHS.cardModels)
const LINGSHU_MODELS = resolveLayout(PATHS.lingshuModels)

/** 十个已知节点类型（与 schema/CardNode 判别值一致） */
const NODE_TYPES = ['stack', 'text', 'image', 'avatar', 'grid', 'pill', 'actionBar', 'spacer', 'divider', 'date']

/**
 * 三方比对容器表。
 * - schema：`#/$defs/<Def>`
 * - ts：`{type: 类型名}` | `{node: 节点类型}` | `{union: 类型名}`
 * - swift：`{file, struct}` | `{file, enum, case}` | `{file, unionOfEnum}` | `{file, unionOfCases: [...]}`
 * - implicit：Swift 侧不体现但在线上 JSON 里合法的键（枚举判别键、以及被宿主统一读取的键）
 */
const CONTAINERS = [
  { id: 'CardDSL（根信封）', schema: '#/$defs/CardDSL', ts: { type: 'CardDSL' }, swift: { file: CARD_MODELS, struct: 'CardDSL' } },

  ...NODE_TYPES.map(t => ({
    id: `CardNode.${t}`,
    schema: `#/$defs/${cap(t)}Node`,
    ts: { node: t },
    // Swift 的 case 标签不含判别键 `type`（在 CodingKeys + 解码里统一处理）
    swift: { file: CARD_MODELS, enum: 'CardNode', case: t },
    implicitSwift: ['type'],
  })),

  { id: 'CardOverlay（压图徽标）', schema: '#/$defs/CardOverlay', ts: { type: 'CardOverlay' }, swift: { file: CARD_MODELS, struct: 'CardOverlay' } },
  { id: 'CardFont（字体）', schema: '#/$defs/CardFont', ts: { type: 'CardFont' }, swift: { file: CARD_MODELS, struct: 'CardFont' } },
  { id: 'GridOverflow（宫格压罩）', schema: '#/$defs/GridOverflow', ts: { type: 'GridOverflow' }, swift: { file: CARD_MODELS, struct: 'GridOverflow' } },
  { id: 'ActionBarItem（actionBar 单项）', schema: '#/$defs/ActionBarItem', ts: { type: 'ActionBarItem' }, swift: { file: CARD_MODELS, struct: 'ActionBarItem' } },
  { id: 'PillStyle（双态单态样式）', schema: '#/$defs/PillStyle', ts: { type: 'PillStyle' }, swift: { file: CARD_MODELS, struct: 'PillStyle' } },
  { id: 'InvokeCall（通用调用）', schema: '#/$defs/InvokeCall', ts: { type: 'InvokeCall' }, swift: { file: CARD_MODELS, struct: 'InvokeCall' } },
  { id: 'InvokeEffect（写侧翻转）', schema: '#/$defs/InvokeEffect', ts: { union: 'InvokeEffect' }, swift: { file: CARD_MODELS, struct: 'InvokeEffect' } },
  { id: 'ImageTransport（图片传输）', schema: '#/$defs/ImageTransport', ts: { type: 'ImageTransport' }, swift: { file: LINGSHU_MODELS, struct: 'ImageTransport' } },
  { id: 'ImageEncryption（图片解密）', schema: '#/$defs/ImageEncryption', ts: { type: 'ImageEncryption' }, swift: { file: LINGSHU_MODELS, struct: 'ImageEncryption' } },

  // 卡片跳转目标链路：三端都是联合，按「全部支字段并集」比；判别键 `action` 是 Swift 侧隐式的
  { id: 'CardTarget（节点 target）', schema: '#/$defs/CardTarget', ts: { union: 'CardTarget' }, swift: { file: CARD_MODELS, unionOfEnum: 'CardTarget', resolve: ['PageJumpTarget'] }, implicitSwift: ['action'] },
  { id: 'PageJumpTarget（跳转目标）', schema: '#/$defs/PageJumpTarget', ts: { union: 'PageJumpTarget' }, swift: { file: LINGSHU_MODELS, unionOfEnum: 'PageJumpTarget' }, implicitSwift: ['action'] },

  // 筛选组（卡片跳转目标可携带落地页筛选栏）
  { id: 'CategoryGroup（筛选组）', schema: '#/$defs/CategoryGroup', ts: { type: 'CategoryGroup' }, swift: { file: LINGSHU_MODELS, struct: 'CategoryGroup' } },
  { id: 'CategoryNode（筛选叶子）', schema: '#/$defs/CategoryNode', ts: { type: 'CategoryNode' }, swift: { file: LINGSHU_MODELS, struct: 'CategoryNode' } },
  { id: 'CategorySection（分节）', schema: '#/$defs/CategorySection', ts: { type: 'CategorySection' }, swift: { file: LINGSHU_MODELS, struct: 'CategorySection' } },
  { id: 'CategoryVisibleCondition（可见条件）', schema: '#/$defs/CategoryVisibleCondition', ts: { type: 'CategoryVisibleCondition' }, swift: { file: LINGSHU_MODELS, struct: 'CategoryVisibleCondition' } },
  { id: 'SortDefaultValue（sort 默认方向）', schema: '#/$defs/SortDefaultValue', ts: { type: 'SortDefaultValue' }, swift: { file: LINGSHU_MODELS, struct: 'SortDefaultValue' } },
]

function cap(s) { return s[0].toUpperCase() + s.slice(1) }

/** TS 腿：取该容器在 types.ts 里的字段集（含索引签名 `*` 时单独标记） */
function tsLeg(parsed, spec) {
  if (spec.node) {
    const hit = unionVariant(parsed, 'CardNode', spec.node)
    if (!hit) return null
    const s = new Set(hit.fields)
    s.add(hit.discKey ?? 'type')
    return s
  }
  if (spec.union) return unionAllFields(parsed, spec.union)
  return tsFields(parsed, spec.type)
}

/** Swift 腿：struct 字段 / enum case 标签 / 整枚举各 case 标签并集（无标签关联值按类型引用展开） */
function swiftLeg(parsedByFile, spec) {
  const parsed = parsedByFile.get(spec.file)
  if (!parsed) return null
  const findType = (name) => {
    for (const p of parsedByFile.values()) {
      if (!p) continue
      if (p.enums.has(name)) return { parsed: p, enum: name }
      if (p.structs.has(name)) return { parsed: p, struct: name }
    }
    return null
  }
  const out = new Set()
  const addRefs = (refs) => {
    for (const ref of refs) {
      const hit = findType(ref)
      if (!hit) return false
      if (hit.enum) {
        for (const c of hit.parsed.enums.get(hit.enum).values()) for (const l of c.labels) out.add(l)
      } else {
        for (const f of hit.parsed.structs.get(hit.struct)) out.add(f)
      }
    }
    return true
  }

  if (spec.struct) {
    const f = parsed.structs.get(spec.struct)
    if (!f) return null
    for (const x of f) out.add(x)
  } else if (spec.enum && spec.case) {
    const c = parsed.enums.get(spec.enum)?.get(spec.case)
    if (!c) return null
    for (const l of c.labels) out.add(l)
    if (!addRefs(c.refs)) return null
  } else if (spec.unionOfEnum) {
    const cases = parsed.enums.get(spec.unionOfEnum)
    if (!cases) return null
    for (const c of cases.values()) {
      for (const l of c.labels) out.add(l)
      if (!addRefs(c.refs)) return null
    }
  } else {
    return null
  }

  for (const extra of spec.implicit ?? []) out.add(extra)
  return out
}

export function runFieldSetGate() {
  const report = createReport('门 1 · 字段集合门（schema ↔ types.ts ↔ CardModels.swift）')
  const schema = readJSON(SCHEMA)
  const typesText = readText(TYPES)
  const tsParsed = typesText ? parseTypescript(TYPES) : null
  const swiftFiles = [CARD_MODELS, LINGSHU_MODELS].filter(Boolean)
  const parsedByFile = new Map()
  for (const f of swiftFiles) {
    const t = readText(f)
    parsedByFile.set(f, t ? parseSwift(t) : null)
  }
  const cardModelsText = CARD_MODELS ? readText(CARD_MODELS) : null

  report.pass('schema 载入', `${Object.keys(schema.$defs).length} 个 $defs（${SCHEMA}）`)
  if (!tsParsed) report.fail('types.ts 载入', `缺 ${TYPES}`)
  if (!cardModelsText) {
    if (REQUIRE_ALL) report.fail('CardModels.swift 载入', `缺 ${PATHS.cardModels[0]}（CONTRACT_REQUIRE_ALL=1 要求三方齐备）`)
    else report.note(`缺 ${PATHS.cardModels[0]} → 跳过 Swift 腿（公开 runtime 仓正常态；母仓请设 CONTRACT_REQUIRE_ALL=1）`)
  }

  let swiftCompared = 0
  for (const c of CONTAINERS) {
    // schema 腿
    let schemaSet
    try {
      schemaSet = c.ts?.node ? schemaVariantFields(schema, c.schema) : schemaFields(schema, c.schema)
    } catch (e) {
      report.fail(`${c.id} · schema`, String(e.message))
      continue
    }
    if (schemaSet.has('*')) {
      report.note(`${c.id} · schema 含开放字段，跳过严格比对`)
      continue
    }

    // TS 腿
    const tsSet = tsParsed ? tsLeg(tsParsed, c.ts ?? {}) : null
    if (!tsSet) {
      report.fail(`${c.id} · types.ts`, `types.ts 里找不到该容器（${JSON.stringify(c.ts)}）——名字改了就要同步本表`)
    } else if (tsSet.has('*')) {
      report.note(`${c.id} · types.ts 含索引签名（开放字段），跳过该容器`)
    } else {
      report.sameSet(tsSet, schemaSet, `${c.id} · schema ↔ types.ts`)
      // 必填比对（只在这一对之间做；Swift 侧刻意全容差）
      if (c.ts?.node) {
        const tsReq = requiredOfNodeType(tsParsed, c.ts.node)
        const schemaReq = schemaRequired(schema, c.schema)
        report.sameSet(tsReq, schemaReq, `${c.id} · 必填集合 schema ↔ types.ts`)
      } else if (c.ts?.type || c.ts?.union) {
        const name = c.ts.type ?? c.ts.union
        const tsReq = requiredOfType(tsParsed, name)
        if (tsReq) report.sameSet(tsReq, schemaRequired(schema, c.schema), `${c.id} · 必填集合 schema ↔ types.ts`)
      }
    }

    // Swift 腿
    if (!cardModelsText) continue
    const swiftFile = resolveLayout(layoutCandidates(c.swift.file))
    if (!swiftFile) {
      report.note(`${c.id} · 缺 ${c.swift.file} → 跳过该容器的 Swift 腿`)
      continue
    }
    const swiftSet = swiftLeg(parsedByFile, { ...c.swift, file: swiftFile })
    if (!swiftSet) {
      report.fail(`${c.id} · Swift`, `找不到 ${c.swift.file} 里的 ${c.swift.struct ?? c.swift.enum ?? c.swift.unionOfEnum}（句式要求见 scripts/contract-gates/lib.mjs 注释）`)
      continue
    }
    const expected = new Set([...swiftSet, ...(c.implicitSwift ?? [])])
    report.sameSet(expected, schemaSet, `${c.id} · schema ↔ ${c.swift.file.split('/').pop()}`)
    swiftCompared++
  }

  // Swift 的 CardNode.CodingKeys 并集必须覆盖全部节点字段（防止「字段在 case 里、CodingKeys 漏了」）
  const cardNodeKeys = parsedByFile.get(CARD_MODELS)?.enums.get('CardNode')
  if (cardModelsText) {
    const enumStart = cardModelsText.indexOf('indirect enum CardNode')
    const keysBlock = enumStart < 0 ? null : /private enum CodingKeys: String, CodingKey \{([\s\S]*?)\n    \}/.exec(cardModelsText.slice(enumStart))
    if (!keysBlock) {
      report.fail('CardNode.CodingKeys 可解析', '未在 CardNode 声明体内找到 CodingKeys 块')
    } else {
      const keys = new Set(
        keysBlock[1]
          .split('\n')
          .map(l => l.replace(/\/\/.*$/, '').replace(/^\s*case\s+/, '').trim())
          .join(',')
          .split(/[,\s]+/)
          .filter(Boolean)
      )
      const allNodeFields = new Set()
      for (const t of NODE_TYPES) {
        for (const f of schemaVariantFields(schema, `#/$defs/${cap(t)}Node`)) allNodeFields.add(f)
      }
      report.sameSet(keys, allNodeFields, 'CardNode.CodingKeys 并集 ↔ schema 十节点字段并集')
    }
    report.expect((cardNodeKeys?.size ?? 0) >= 10, 'CardNode 枚举可解析', `${cardNodeKeys?.size ?? 0} 个 case`)
  }

  report.print()
  if (cardModelsText) report.note(`Swift 腿覆盖 ${swiftCompared}/${CONTAINERS.length} 个容器`)
  return report
}

function requiredOfNodeType(parsed, nodeType) {
  // TS 必填判定：属性签名无 `?` 即必填（在 CardNode 联合的该支里）
  const out = new Set()
  const variants = parsed.unions.get('CardNode') ?? []
  const hit = variants.find(v => v.disc === nodeType)
  if (!hit) return out
  for (const f of hit.required ?? []) out.add(f)
  return out
}

function requiredOfType(parsed, name) {
  const req = parsed.required?.get(name)
  return req ? new Set(req) : null
}
