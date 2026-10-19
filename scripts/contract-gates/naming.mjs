// 门 0 · 命名门：旧名的回退防护 + 包名/workspace 一致性。
//
// 背景一：Phase 1 把 `simulator/` 改名为 `runtime/`（包名 `@lingshu/simulator` → `@lingshu/runtime`，
// 见内部设计记录）。改名很容易被「顺手抄旧路径」回退，而旧路径在拆仓后会让公开仓连构建都跑不起来
// （devconsole/iOS 里任何 `../simulator/...` 引用在独立仓都是死链）。
//
// 背景二（2026-10）：npm 包名**去掉 scope**——`@lingshu/runtime` → `lingshu-runtime`、
// `@lingshu/devconsole` → `lingshu-devconsole`。原因：npm 组织 `lingshu` 已被一个**零包**组织占用，
// 而 npm 的 [Username Policy](https://docs.npmjs.com/policies/disputes) 明说「不按需转移组织名，
// 只受理商标主张」，所以 scope 永远拿不到。见内部设计记录（补记）。
//
// 判定口径：只查**路径/包名形态**（`simulator/src`、`@lingshu/simulator`、`-w simulator`…），
// 不查裸词——历史内部设计记录与 `docs/superpowers/**` 里的「simulator」是当时的记录（有意不改写），
// `ios/docs/simulator-debugging.md` 是**永不可改名的文件名**（ios/AGENTS.md 红线）。
// 旧 scope 同理：只查**会被解析器/包管理器读到的形态**（import / require / 依赖键），
// 不查散文字样——`runtime/docs/program-api.md` 与 `docs/opensource/execution-phases.md` 里
// 逐字保留着当时的构建报错日志，改了它反而让后人搜不到那条错误。
//
// 用法：node scripts/contract-gates/naming.mjs

import { ROOT, createReport, isMonorepo, readJSON, readText } from './lib.mjs'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 只扫「会被发布/会被构建消费」的目录；历史记录目录整棵排除。
 * 同时覆盖母仓布局（`runtime/`、`devconsole/`、`ios/`…）与公开仓布局（`src/`、`server/`、`skills/`…）。
 */
const SCAN_DIRS = ['runtime', 'src', 'devconsole', 'server', 'ios', 'lingshu-skills', 'skills', 'lingshu-plugins', 'contracts', 'scripts', 'publish', 'docs']
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'build_test', 'build_dev', '.git', 'DerivedData', 'Pods'])
const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|swift|md|yml|yaml|sh|py|txt|lock|plist|pbxproj|env|example)$/
/** 本文件自身：FORBIDDEN 的字面量就在它的源码里，必须排除，否则门永远自红 */
const SELF = 'scripts/contract-gates/naming.mjs'

/**
 * 免检路径（**有意保留旧名的历史记录**，与 ios/AGENTS.md 的红线同一口径）：
 *   历史记录目录——决策记录正文 / 历史计划与复盘 / 开源拆分自己的规则文档
 *   （该文档必须能引用旧形态才能写规则；当时的记录，回改等于篡改历史）。
 * 判定仍会在「公开仓快照」上跑一次：公开快照不带决策记录，列表里的相应项自然失效。
 */
const EXEMPT_PREFIXES = ['docs/superpowers/', 'docs/opensource/']

/** 旧名的路径/包名形态（真正的回退面） */
const FORBIDDEN = [
  { re: /@lingshu\/simulator/g, why: '旧包名' },
  { re: /lingshu-simulator/g, why: '旧仓名' },
  { re: /(?:^|[\s'"`(=])(?:\.\.\/)+simulator\//g, why: '旧目录相对引用' },
  { re: /\bsimulator\/(?:src|dist|package\.json|assets|tsconfig)/g, why: '旧目录路径' },
  { re: /-w\s+simulator\b/g, why: '旧 workspace 名' },
  { re: /workspace[^\n]*"simulator"/g, why: '旧 workspace 声明' },
  // 旧 npm scope（背景二）。只查会被解析器读到的形态：散文字样与逐字日志有意放行（见文件头）。
  { re: /from\s+['"]@lingshu\/(?:runtime|devconsole)/g, why: '旧 scope 的 import' },
  { re: /require\(\s*['"]@lingshu\/(?:runtime|devconsole)/g, why: '旧 scope 的 require' },
  { re: /['"]@lingshu\/(?:runtime|devconsole)['"]\s*:/g, why: '旧 scope 的依赖键' },
]

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('build')) continue   // build / build_real / build_test / build_dev …
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) walk(abs, out)
    else if (TEXT_EXT.test(entry.name)) out.push(abs)
  }
  return out
}

export function runNamingGate() {
  const report = createReport('门 0 · 命名门（旧名回退 + 包名/workspace 一致）')
  const root = readJSON('package.json')
  const monorepo = isMonorepo()

  // ① 旧目录不得复活（两种布局都查）
  report.expect(!existsSync(join(ROOT, 'simulator')), '旧目录 simulator/ 不存在', '若它回来了，说明改名被回退')

  // ② 包名一致：母仓查 workspaces 与目录名；公开 runtime 仓 = 单包，根 package.json 就是它
  if (monorepo) {
    const workspaces = root.workspaces ?? []
    report.sameSet(workspaces, ['runtime', 'devconsole'], 'workspace 列表')
    for (const ws of workspaces) {
      const pkgPath = `${ws}/package.json`
      if (!existsSync(join(ROOT, pkgPath))) {
        report.fail(`workspace ${ws}`, `缺 ${pkgPath}`)
        continue
      }
      const pkg = readJSON(pkgPath)
      report.expect(pkg.name === `lingshu-${ws}`, `包名 lingshu-${ws}`, `实际 ${pkg.name}`)
    }
  } else {
    report.expect(/^lingshu-[a-z0-9-]+$/.test(root.name ?? ''), '单包仓根包名 lingshu-<name>', `实际 ${root.name}`)
  }

  // ③ 全树扫旧名形态（含根级文本文件）
  const files = []
  for (const d of SCAN_DIRS) {
    const abs = join(ROOT, d)
    if (existsSync(abs) && statSync(abs).isDirectory()) walk(abs, files)
  }
  for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isFile() || !TEXT_EXT.test(entry.name)) continue
    files.push(join(ROOT, entry.name))
  }
  const hits = []
  let exempt = 0
  for (const abs of files) {
    const rel = abs.slice(ROOT.length + 1).replace(/\\/g, '/')
    if (rel === SELF) continue
    if (EXEMPT_PREFIXES.some(pfx => rel.startsWith(pfx))) { exempt++; continue }
    const text = readText(rel)
    if (text === null) continue
    for (const { re, why } of FORBIDDEN) {
      for (const m of text.matchAll(re)) {
        const line = text.slice(0, m.index).split('\n').length
        hits.push(`${abs.slice(ROOT.length + 1)}:${line}（${why}：${m[0].trim()}）`)
      }
    }
  }
  report.expect(hits.length === 0, '全树无旧名路径/包名形态',
    hits.length ? `\n      ${hits.slice(0, 20).join('\n      ')}` : `${files.length - exempt} 个文件（另免检 ${exempt} 个历史记录文件）`)

  // ④ 消费方不得依赖旧包（母仓看 devconsole；公开 devconsole 仓看仓根）
  const dcPath = existsSync(join(ROOT, 'devconsole/package.json')) ? 'devconsole/package.json' : 'package.json'
  const dcPkg = readJSON(dcPath)
  const isDevconsole = dcPath === 'package.json' && (dcPkg.name ?? '').includes('devconsole')
  const deps = { ...dcPkg.dependencies, ...dcPkg.devDependencies }
  if (isDevconsole || dcPath === 'devconsole/package.json') {
    report.expect(Object.keys(deps).some(k => k.startsWith('lingshu-runtime')), `${dcPath} 依赖 lingshu-runtime`, Object.keys(deps).filter(k => k.startsWith('lingshu-') || k.startsWith('@lingshu/')).join(', ') || '（无 lingshu-* 依赖）')
    report.expect(!Object.keys(deps).some(k => k.includes('simulator')), `${dcPath} 无旧包依赖`)
  } else {
    report.note(`${dcPath} 不是 devconsole 包 → 跳过依赖检查`)
  }

  report.print()
  return report
}
