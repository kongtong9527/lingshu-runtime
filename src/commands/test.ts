import fs from 'node:fs'
import { parsePluginMeta } from '../types.js'
import { resolvePluginDir, findPluginFile } from './run.js'

/** test 命令入口：轻量格式校验（元数据 + 接口完整性） */
export async function testCommand(
  pluginId: string,
  options: { dir?: string },
): Promise<void> {
  const pluginDir = resolvePluginDir(options.dir)
  const pluginFile = findPluginFile(pluginDir, pluginId)
  if (!pluginFile) {
    console.error(`错误: 找不到插件 "${pluginId}"（查找目录: ${pluginDir}）`)
    process.exit(1)
  }

  console.log(`校验插件: ${pluginId}\n`)
  const code = fs.readFileSync(pluginFile, 'utf-8')
  const meta = parsePluginMeta(code)

  const checks: Array<{ name: string; pass: boolean }> = []
  checks.push({ name: '// ==Plugin== 元数据头', pass: !!meta })
  if (meta) {
    checks.push({ name: 'id', pass: !!meta.id })
    checks.push({ name: 'name', pass: !!meta.name })
    checks.push({ name: 'version', pass: !!meta.version })
    checks.push({ name: 'sourceUrl', pass: !!meta.sourceUrl })
  }
  checks.push({ name: 'fetchList 方法', pass: code.includes('fetchList') })
  checks.push({ name: 'fetchDetail 方法', pass: code.includes('fetchDetail') })

  let allPass = true
  for (const c of checks) {
    console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}`)
    if (!c.pass) allPass = false
  }
  console.log(`\n  结果: ${allPass ? '全部通过 ✓' : '部分失败 ✗'}`)
  if (!allPass) process.exit(1)
}
