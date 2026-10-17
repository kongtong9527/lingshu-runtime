#!/usr/bin/env node
// 契约门总入口（母仓与公开仓共用）：
//   门 0 命名门        —— 旧名 simulator 回退防护 + 包名/workspace 一致
//   门 1 字段集合门    —— schema ↔ runtime/src/types.ts ↔ CardModels.swift 三方字段集
//   门 2 $lib 签名门   —— lib-api.json ↔ Node 实跑 ↔ iOS 桥静态抽取 ↔ 文档 ↔ 版本（两条号段）
//   门 3 conformance 门 —— 跨端语料同时喂 schema 与 runtime 解析器 + 字段覆盖率
//
// 用法：
//   node scripts/contract-gates/run.mjs            # 缺腿即跳过并汇报（公开仓常态）
//   CONTRACT_REQUIRE_ALL=1 node scripts/...        # 三方齐备才算过（母仓 CI）
//   门 3 补 counts：node scripts/contract-gates/conformance.mjs --record
//   门 2 刷新注入面指纹：node scripts/contract-gates/run.mjs --record-surface-hash
//     （**只许在「注入面变了但语义未变」时用**；契约面变更要递增 contractVersion，见 docs/adr/0069）
//
// 前置：先 `npm run -w runtime build`（门 2/门 3 消费 dist）。

import { REQUIRE_ALL } from './lib.mjs'
import { runNamingGate } from './naming.mjs'
import { runFieldSetGate } from './field-set.mjs'
import { runLibApiGate } from './lib-api.mjs'
import { runConformanceGate } from './conformance.mjs'

const gates = [
  ['命名', runNamingGate],
  ['字段集合', runFieldSetGate],
  ['$lib 签名', () => runLibApiGate({ recordSurfaceHash: process.argv.includes('--record-surface-hash') })],
  ['conformance 语料', () => runConformanceGate({ record: process.argv.includes('--record') })],
]

let failed = 0
let total = 0
for (const [name, run] of gates) {
  try {
    const report = await run()
    failed += report.failed.length
    total += report.checks.length
  } catch (e) {
    failed++
    console.error(`\n══ 门「${name}」异常 ══\n  ${e?.stack ?? e}`)
  }
}

console.log(`\n──────────────────────────────────────────`)
console.log(`契约门汇总：${gates.length} 道门 / ${total} 项检查 / ${failed} 项失败${REQUIRE_ALL ? '（CONTRACT_REQUIRE_ALL=1：三方必须齐备）' : ''}`)
process.exit(failed === 0 ? 0 : 1)
