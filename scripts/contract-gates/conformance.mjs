// 门 3 · conformance 语料门：同一份跨端语料分别喂 JSON Schema（发布契约）与 runtime 解析器。
//
// 语料是「可执行契约」：每个 case 给出卡片 JSON + 期望（ok/warnings/counts）。
//   · 本门（Node 侧）：schema 校验 + runtime `validateCardDSL` 行为
//   · iOS 侧：ios/LingshuTests/CardDSLConformanceTests.swift 读**同一批文件**，
//     断言解码不抛错、整卡回退判定与 counts 与语料一致、encode↔decode 一轮后稳定
//   · 覆盖率：schema 里声明的每个字段、每种节点都必须被某个 ok:true 的 case 真实用到
//     （防止「schema 有字段、语料没证据」）
//
// 用法：node scripts/contract-gates/conformance.mjs [--record]
//   --record 只补**缺失**的 expect.counts（不覆盖已有值，也不改 ok/warnings）——CI 不得带此参数。

import { PATHS, ROOT, createReport, readJSON, resolveLayout } from './lib.mjs'
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const SCHEMA = 'contracts/card-dsl.schema.json'
const CORPUS_DIR = 'contracts/conformance'
const CARD_DSL_DIST = resolveLayout(PATHS.cardDslDist) ?? PATHS.cardDslDist[0]
const NODE_TYPES = ['stack', 'text', 'image', 'avatar', 'grid', 'pill', 'actionBar', 'spacer', 'divider', 'date']

/** 递归收集一个 JSON 里出现的全部键名（用于覆盖率） */
function collectKeys(value, into = new Set()) {
  if (Array.isArray(value)) { for (const v of value) collectKeys(v, into); return into }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { into.add(k); collectKeys(v, into) }
  }
  return into
}

function collectNodeTypes(value, into = new Set()) {
  if (Array.isArray(value)) { for (const v of value) collectNodeTypes(v, into); return into }
  if (value && typeof value === 'object') {
    if (typeof value.type === 'string') into.add(value.type)
    for (const v of Object.values(value)) collectNodeTypes(v, into)
  }
  return into
}

/** schema 全部 $defs 变体里声明的字段名（排除纯结构容器 UnknownNode 的开放字段） */
function schemaFieldNames(schema) {
  const out = new Set()
  for (const [name, node] of Object.entries(schema.$defs)) {
    if (name === 'UnknownNode') continue
    for (const k of Object.keys(node.properties ?? {})) out.add(k)
    for (const variant of node.oneOf ?? []) {
      const v = variant.$ref ? schema.$defs[variant.$ref.split('/').pop()] : variant
      for (const k of Object.keys(v.properties ?? {})) out.add(k)
    }
  }
  return out
}

export async function runConformanceGate({ record = false } = {}) {
  const report = createReport('门 3 · conformance 语料门（schema ↔ runtime ↔ 语料）')
  const schema = readJSON(SCHEMA)

  const Ajv2020 = (await import('ajv/dist/2020.js')).default
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  const validate = ajv.compile(schema)

  const distAbs = join(ROOT, CARD_DSL_DIST)
  if (!existsSync(distAbs)) {
    report.fail('runtime/dist 存在', `缺 ${CARD_DSL_DIST} —— 先跑 ${PATHS.buildHint}`)
    report.print()
    return report
  }
  const { validateCardDSL, CARD_LIMITS } = await import(new URL(`file://${distAbs}`).href)
  report.pass('runtime 载入', `CARD_LIMITS = 节点≤${CARD_LIMITS.maxNodes} / 深≤${CARD_LIMITS.maxDepth} / 图≤${CARD_LIMITS.maxImages} / 高≤${CARD_LIMITS.maxCardHeight}`)

  const files = readdirSync(join(ROOT, CORPUS_DIR)).filter(f => f.endsWith('.json')).sort()
  report.expect(files.length > 0, '语料文件存在', `${files.length} 个：${files.join(', ')}`)

  const coveredKeys = new Set()
  const coveredTypes = new Set()
  let caseCount = 0
  let recorded = 0

  for (const file of files) {
    const corpus = readJSON(`${CORPUS_DIR}/${file}`)
    const cases = corpus.cases ?? []
    report.expect(cases.length > 0, `${file} 有 case`, `${cases.length} 个：${corpus.title ?? ''}`)
    for (const c of cases) {
      caseCount++
      const label = `${file} · ${c.name}`
      // ① schema 校验
      const schemaOk = validate(c.card)
      if (c.expect.ok) {
        report.expect(schemaOk, `${label} · schema 校验通过`,
          schemaOk ? undefined : ajv.errorsText(validate.errors, { separator: ' | ' }))
      } else {
        report.expect(!schemaOk, `${label} · schema 应当拒绝（整卡回退用例）`,
          !schemaOk ? undefined : '结构非法却在 schema 下合法——回退判定与 schema 不一致')
      }
      // ② runtime 行为
      const got = validateCardDSL(c.card)
      report.expect(got.ok === c.expect.ok, `${label} · 回退判定`,
        `契约 ok=${c.expect.ok}，runtime ok=${got.ok}${got.errors.length ? `（${got.errors.join('；')}）` : ''}`)
      const expectedWarn = c.expect.warnings ?? []
      const unmatched = expectedWarn.filter(w => !got.warnings.some(a => a.includes(w)))
      const unexpected = got.warnings.filter(a => !expectedWarn.some(w => a.includes(w)))
      report.expect(unmatched.length === 0 && unexpected.length === 0, `${label} · warnings 集合`,
        unmatched.length || unexpected.length
          ? `缺期望「${unmatched.join(' / ')}」；多实际「${unexpected.join(' / ')}」`
          : (expectedWarn.length ? `${expectedWarn.length} 条命中` : '无 warning'))
      // ③ counts（跨端同源：nodeCount / depth / imageCount）
      // **只在 ok:true 时是契约**：整卡会被丢弃的用例里 counts 无意义（两端对「非法 root 算不算 1 个节点」
      // 可自由取舍——语料刻意不写 counts，写了也不比）。
      const counts = { nodes: got.nodeCount, depth: got.depth, images: got.imageCount }
      if (!c.expect.ok) {
        // 不校验
      } else if (!c.expect.counts) {
        if (record) {
          c.expect.counts = counts
          recorded++
        } else {
          report.fail(`${label} · expect.counts 缺失`, '跑一次 node scripts/contract-gates/conformance.mjs --record 补齐')
        }
      } else {
        const same = c.expect.counts.nodes === counts.nodes && c.expect.counts.depth === counts.depth && c.expect.counts.images === counts.images
        report.expect(same, `${label} · counts`,
          same ? `nodes=${counts.nodes} depth=${counts.depth} images=${counts.images}`
            : `契约 ${JSON.stringify(c.expect.counts)}，runtime ${JSON.stringify(counts)}`)
      }
      if (c.expect.ok) {
        collectKeys(c.card, coveredKeys)
        collectNodeTypes(c.card, coveredTypes)
      }
    }
    if (record) writeFileSync(join(ROOT, CORPUS_DIR, file), JSON.stringify(corpus, null, 2) + '\n')
  }

  // ④ 覆盖率：schema 声明的字段与节点类型都必须有 ok:true 语料证据
  const declared = schemaFieldNames(schema)
  const uncovered = [...declared].filter(k => !coveredKeys.has(k) && k !== 'type')
  report.expect(uncovered.length === 0, 'schema 字段覆盖率（ok:true 语料）',
    uncovered.length ? `未被任何合法语料用到的字段：${uncovered.join(', ')}` : `${declared.size} 个字段全覆盖`)
  const missType = NODE_TYPES.filter(t => !coveredTypes.has(t))
  report.expect(missType.length === 0, '节点类型覆盖率', missType.length ? `缺 ${missType.join(', ')}` : `${NODE_TYPES.length} 种全覆盖`)
  report.expect(caseCount >= 40, '语料规模', `${caseCount} 个 case / ${files.length} 个文件`)

  report.print()
  if (record) report.note(`--record：补齐了 ${recorded} 处 expect.counts`)
  return report
}
