#!/usr/bin/env node
/**
 * lingshu-plugin-dev 技能自检
 *
 * 检查四件事（改完 SKILL/references 后跑一次，防止漂移）：
 *   1. 相对链接是否断链（重命名参考文件、外移段落时最容易踩）
 *   2. 目录是否与正文同步（pitfalls 70 条 / data-model 等文件的「## 目录」）
 *   3. 体积预算（SKILL 主文件别重新膨胀回去）
 *   4. CLI 能力覆盖（母仓内才有 runtime 源码；npm 安装后自动跳过）
 *
 * 用法：node scripts/check-skill.mjs
 * 退出码：0 = 通过；1 = 有错误。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const errors = []
const warnings = []
const checks = []

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')
const relOf = (p) => path.relative(root, p)

// ---------- 1. 断链 ----------
const mdFiles = [
  'SKILL.md',
  ...fs
    .readdirSync(path.join(root, 'references'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => `references/${f}`),
]
let linkCount = 0
for (const rel of mdFiles) {
  const text = read(rel)
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1]
    if (/^(https?:|mailto:|#)/.test(target)) continue
    linkCount++
    const clean = target.split('#')[0]
    if (!clean) continue
    const resolved = path.resolve(path.dirname(path.join(root, rel)), clean)
    if (!fs.existsSync(resolved)) {
      errors.push(`断链：${rel} → ${target}`)
    }
  }
}
checks.push({ name: `相对链接 ${linkCount} 个`, ok: errors.length === 0 })

// 1b. references 内部引用别带 `references/` 前缀（同目录解析会变成 references/references/）
for (const rel of mdFiles.filter((f) => f.startsWith('references/'))) {
  for (const m of read(rel).matchAll(/`references\/([^`]+\.md)`/g)) {
    errors.push(`${rel} 写成 \`references/${m[1]}\`，应写同目录 \`${m[1]}\``)
  }
}
checks.push({ name: 'references 内部路径前缀', ok: errors.length === 0 })

// ---------- 2. 目录同步 ----------
const pit = read('references/pitfalls.md')
const h3 = [...pit.matchAll(/^### (.+)$/gm)].map((m) => m[1].trim())
const tocBlock = pit.slice(pit.indexOf('## 条目目录'), pit.indexOf('## 常见问题与踩坑记录'))
const tocItems = [...tocBlock.matchAll(/^\d+\. (.+)$/gm)].map((m) => m[1].trim())
if (tocItems.length !== h3.length) {
  errors.push(`pitfalls 目录 ${tocItems.length} 条 ≠ 正文 ${h3.length} 条（新增条目后补目录）`)
} else {
  const missing = h3.filter((h, i) => h !== tocItems[i])
  if (missing.length) errors.push(`pitfalls 目录与正文标题不一致：${missing[0].slice(0, 40)}…`)
}
checks.push({ name: `pitfalls 目录 ${tocItems.length} 条`, ok: errors.length === 0 })

// 写死的「N 条」不能漂移（新增条目后同步改两处文案）
for (const [label, re] of [
  ['SKILL.md', /全文 (\d+) 条在/],
  ['references/pitfalls.md', /全文（(\d+) 条/],
]) {
  const text = label === 'SKILL.md' ? read('SKILL.md') : pit
  const m = text.match(re)
  if (m && Number(m[1]) !== h3.length) {
    errors.push(`${label} 写「${m[1]} 条」，实际 ${h3.length} 条`)
  }
}

for (const [rel, skip] of [
  ['references/data-model.md', '目录'],
  ['references/api-reference.md', '目录'],
  ['references/website-analysis.md', '目录'],
]) {
  const text = read(rel)
  const h2 = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim())
  const toc = [...text.matchAll(/^- \[(.+?)\]\(#/gm)].map((m) => m[1].trim())
  const body = h2.filter((h) => h !== skip)
  const missing = body.filter((h) => !toc.includes(h))
  const stale = toc.filter((h) => !body.includes(h))
  if (missing.length) errors.push(`${rel} 目录缺 ${missing.length} 节：${missing[0].slice(0, 40)}…`)
  if (stale.length) errors.push(`${rel} 目录有 ${stale.length} 条已不在正文：${stale[0].slice(0, 40)}…`)
}
checks.push({ name: '参考文件目录同步', ok: errors.length === 0 })

// ---------- 3. 体积预算 ----------
const budget = { 'SKILL.md': 26000 }
const sizes = Object.fromEntries(
  mdFiles.map((rel) => {
    const chars = read(rel).length
    return [rel, chars]
  }),
)
for (const [rel, max] of Object.entries(budget)) {
  if (sizes[rel] > max) {
    errors.push(`${rel} 体积 ${sizes[rel]} 字符 > 预算 ${max}（该外移了）`)
  }
}
const totalRefs = Object.entries(sizes).reduce((s, [k, v]) => (k === 'SKILL.md' ? s : s + v), 0)
checks.push({
  name: `体积：SKILL ${(sizes['SKILL.md'] / 1000).toFixed(1)}k 字符，references ${(totalRefs / 1000).toFixed(1)}k`,
  ok: errors.length === 0,
})

// ---------- 4. CLI 能力覆盖（母仓内才检） ----------
const cliSrc = path.resolve(root, '..', '..', 'runtime', 'src', 'index.ts')
if (fs.existsSync(cliSrc)) {
  const src = fs.readFileSync(cliSrc, 'utf8')
  const m = src.match(/action: ([a-z/-]+)；/)
  if (m) {
    const cliActions = m[1].split('/')
    const skill = read('SKILL.md')
    const documented = new Set(
      [...skill.matchAll(/^\| `([a-z-]+)` \|/gm)].map((x) => x[1]),
    )
    const missing = cliActions.filter((a) => !documented.has(a))
    if (missing.length) errors.push(`阶段 3 命令表缺 action：${missing.join(', ')}`)
    checks.push({ name: `CLI 动作 ${cliActions.length} 个全部覆盖`, ok: missing.length === 0 })
  }
  if (!read('SKILL.md').includes('lingshu listings')) {
    errors.push('阶段 3 未提 `lingshu listings`（目录页校验的官方命令）')
  }
} else {
  warnings.push('未找到 runtime 源码（npm 安装布局），跳过 CLI 覆盖检查')
}

// ---------- 输出 ----------
console.log('灵枢插件开发技能自检\n')
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}`)
for (const w of warnings) console.log(`  ! ${w}`)
if (errors.length) {
  console.log('\n发现问题：')
  for (const e of errors) console.log(`  - ${e}`)
  process.exit(1)
}
console.log('\n结果：全部通过 ✓')
