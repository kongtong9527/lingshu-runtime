import fs from 'node:fs'
import { createSandbox, type Sandbox } from './sandbox.js'
import { parsePluginMeta, type LingshuPlugin, type PluginMeta } from './types.js'

export interface LoadedPlugin {
  meta: PluginMeta
  plugin: LingshuPlugin
  sourceFile: string
}

/**
 * 从文件加载一个灵枢插件：
 *   1. 读取源码并解析 ==Plugin== 元数据头
 *   2. 校验必填字段（id / name / version）
 *   3. 在沙箱中执行，取出 module.exports
 *   4. 校验导出对象含 fetchList / fetchDetail
 *
 * 可选传入 sandbox 用于复用已覆盖 $lib 的沙箱（如 CLI 的 fixture 模式：
 * 先覆盖 sandbox.$lib.http.get 返回本地 HTML，再加载插件）。
 */
export function loadPlugin(filePath: string, sandbox?: Sandbox): LoadedPlugin {
  let code: string
  try {
    code = fs.readFileSync(filePath, 'utf-8')
  } catch (e) {
    // 文件不存在或不可读时给出带插件上下文的友好错误（保留原始错误为 cause）
    throw new Error(`插件文件 ${filePath} 不存在或不可读`, { cause: e })
  }

  const meta = parsePluginMeta(code)
  if (!meta) {
    throw new Error(`插件文件 ${filePath} 缺少 // ==Plugin== 元数据头`)
  }

  // 必填字段校验（Task 1 评审遗留 Important 项）
  const missing: string[] = []
  if (!meta.id) missing.push('id')
  if (!meta.name) missing.push('name')
  if (!meta.version) missing.push('version')
  if (missing.length > 0) {
    throw new Error(`插件 ${filePath} 元数据缺少必填字段: ${missing.join(', ')}`)
  }

  const sb = sandbox ?? createSandbox()

  // 执行插件代码，取出 module.exports
  const wrapperCode = `
    const module = { exports: {} };
    ${code}
    module.exports;
  `
  const pluginExports = sb.runInContext(wrapperCode, filePath) as LingshuPlugin

  if (!pluginExports || typeof pluginExports.fetchList !== 'function') {
    throw new Error(`插件 ${meta.id} 缺少 fetchList 方法`)
  }
  if (typeof pluginExports.fetchDetail !== 'function') {
    throw new Error(`插件 ${meta.id} 缺少 fetchDetail 方法`)
  }

  // 导出对象的 id/name/version 以元数据头（meta）为权威来源做兜底：
  // 插件可能只赋值了部分字段，确保返回的 plugin 三字段必有值
  pluginExports.id = pluginExports.id || meta.id
  pluginExports.name = pluginExports.name || meta.name
  pluginExports.version = pluginExports.version || meta.version

  return { meta, plugin: pluginExports, sourceFile: filePath }
}
