import path from 'node:path'
import fs from 'node:fs'
import { parsePluginMeta } from '../types.js'
import { resolvePluginDir } from './run.js'

/** list 命令入口：列出目录下所有 .plugin.js 及其元数据 */
export async function listCommand(options: { dir?: string }): Promise<void> {
  const pluginDir = resolvePluginDir(options.dir)
  try {
    const files = fs
      .readdirSync(pluginDir)
      .filter((f) => f.endsWith('.plugin.js'))
      .sort()

    if (files.length === 0) {
      console.log(`没有找到插件文件（查找目录: ${pluginDir}）`)
      return
    }

    console.log(`\n  可用插件 (${pluginDir}):\n`)
    for (const file of files) {
      const code = fs.readFileSync(path.join(pluginDir, file), 'utf-8')
      const meta = parsePluginMeta(code)
      if (meta) {
        console.log(
          `  ${meta.id.padEnd(20)} ${meta.name.padEnd(20)} v${meta.version}`,
        )
        if (meta.description) {
          console.log(`  ${' '.repeat(20)} ${meta.description}`)
        }
        console.log()
      }
    }
  } catch (err: any) {
    console.error(`错误: 无法读取插件目录 ${pluginDir}（${err.message}）`)
    process.exit(1)
  }
}
