import fs from 'node:fs'
import path from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 插件 id 口径：与现有插件一致（小写字母/数字 + 连字符，如 github-trending） */
export const PLUGIN_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** 目标目录解析：显式 --dir 则 resolve，否则为调用时的当前工作目录（vitest worker 禁 chdir，故 cwd 可注入单测） */
export function resolveTargetDir(explicit?: string, cwd = process.cwd()): string {
  return explicit ? path.resolve(explicit) : cwd
}

/**
 * 定位模板文件 `template.plugin.js`。
 * 按运行位置依次尝试（编译后 dist 布局 / 母仓源码布局），找到第一个存在的返回。
 */
export function findTemplateFile(): string | null {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    // 公开仓 + npm 包布局：<包根>/skills/lingshu-plugin-dev/template.plugin.js
    //（src/commands 与 dist/commands 都是包根下两级，统一上两级即包根）
    path.join(here, '..', '..', 'skills', 'lingshu-plugin-dev', 'template.plugin.js'),
    // 母仓源码布局：<仓根>/lingshu-skills/lingshu-plugin-dev/template.plugin.js
    //（src/commands 或 dist/commands 上三级即仓根）
    path.join(here, '..', '..', '..', 'lingshu-skills', 'lingshu-plugin-dev', 'template.plugin.js'),
  ]
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
    } catch {
      /* 继续下一个候选 */
    }
  }
  return null
}

export interface ScaffoldOptions {
  /** 目标目录（缺省为当前工作目录）：插件文件落在这里 */
  dir?: string
  /** 已存在同名文件时是否覆盖 */
  force?: boolean
}

export interface ScaffoldResult {
  pluginFile: string
  fixtureDir: string
}

/**
 * 脚手架核心（可单测）：把模板复制为 `<id>.plugin.js` 并建好 `_fixtures/<id>/`。
 * 失败时抛错（由 CLI 入口统一转成 stderr + exit 1），成功返回落盘路径。
 */
export function scaffoldPlugin(pluginId: string, options: ScaffoldOptions = {}): ScaffoldResult {
  if (!PLUGIN_ID_RE.test(pluginId)) {
    throw new Error(
      `插件 id 非法："${pluginId}"（只允许小写字母/数字 + 连字符，如 my-site；首尾不能是连字符）`,
    )
  }
  const targetDir = resolveTargetDir(options.dir)
  const templateFile = findTemplateFile()
  if (!templateFile) {
    throw new Error('找不到模板 template.plugin.js（包安装不完整，请重装 lingshu-runtime）')
  }
  const pluginFile = path.join(targetDir, `${pluginId}.plugin.js`)
  if (fs.existsSync(pluginFile) && !options.force) {
    throw new Error(`已存在 ${pluginFile}（加 --force 覆盖）`)
  }
  const template = fs.readFileSync(templateFile, 'utf-8')
  // 只替换元数据头的 id 行，其余 your-* 占位留给作者按站点填写
  const code = template.replace('// id: your-plugin-id', `// id: ${pluginId}`)
  fs.mkdirSync(targetDir, { recursive: true })
  fs.writeFileSync(pluginFile, code, 'utf-8')
  const fixtureDir = path.join(targetDir, '_fixtures', pluginId)
  fs.mkdirSync(fixtureDir, { recursive: true })
  const gitkeep = path.join(fixtureDir, '.gitkeep')
  if (!fs.existsSync(gitkeep)) fs.writeFileSync(gitkeep, '', 'utf-8')
  return { pluginFile, fixtureDir }
}

/** `lingshu init <plugin-id>` CLI 入口：失败即报错退出 */
export async function initCommand(pluginId: string, options: { dir?: string; force?: boolean }): Promise<void> {
  try {
    const { pluginFile, fixtureDir } = scaffoldPlugin(pluginId, options)
    const displayDir = options.dir ?? '.'
    const fixtureExample = path.join(displayDir, '_fixtures', pluginId, 'list.html')
    console.log(`已生成插件: ${pluginFile}`)
    console.log(`夹具目录: ${fixtureDir}`)
    console.log('')
    console.log('下一步：')
    console.log(`  1. 填 ${pluginId}.plugin.js 顶部元数据头与 fetchList/fetchDetail`)
    console.log(`  2. lingshu test ${pluginId} --dir ${displayDir}`)
    console.log(`  3. lingshu run ${pluginId} list --dir ${displayDir} --fixture ${fixtureExample}`)
  } catch (err: any) {
    console.error(`错误: ${err?.message ?? err}`)
    process.exit(1)
  }
}
