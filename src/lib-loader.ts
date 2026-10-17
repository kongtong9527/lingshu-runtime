import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const JS_LIB_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../assets/js-lib',
)

// 加载策略：
//   umd     —— 提供 module/exports，捕获 module.exports（回退到全局 name）
//   call    —— 执行后调用包装函数 fn()，捕获返回值
//   globals —— 直接执行，从全局变量 globals 中取第一个已定义的
// requires —— 需要预注入的已加载依赖（作为沙箱全局）
type LoadStrategy =
  | ({ kind: 'umd'; requires?: string[] })
  | ({ kind: 'call'; fn: string; requires?: string[] })
  | ({ kind: 'globals'; globals: string[]; requires?: string[] })

interface LibEntry {
  file: string
  name: string
  strategy: LoadStrategy
}

// 加载顺序：被依赖者排在前面（CryptoJS 必须先于 JSEncrypt / jsrsasign）
const LIB_REGISTRY: LibEntry[] = [
  { file: 'cheerio.min.js', name: 'cheerio', strategy: { kind: 'umd' } },
  { file: 'CryptoJS.min.js', name: 'CryptoJS', strategy: { kind: 'call', fn: 'createCryptoJS' } },
  { file: 'dayjs.js', name: 'dayjs', strategy: { kind: 'call', fn: 'loadDayjs' } },
  { file: 'Buffer.min.js', name: 'Buffer', strategy: { kind: 'call', fn: 'loadBuffer' } },
  { file: 'crypto.js', name: 'crypto', strategy: { kind: 'call', fn: 'loadCrypto' } },
  { file: 'iconv-lite.js', name: 'iconvLite', strategy: { kind: 'call', fn: 'loadIconv' } },
  { file: 'JSEncrypt.min.js', name: 'JSEncrypt', strategy: { kind: 'call', fn: 'loadJSEncrypt', requires: ['CryptoJS'] } },
  { file: 'jsrsasign.js', name: 'jsrsasign', strategy: { kind: 'globals', globals: ['KJUR'], requires: ['CryptoJS'] } },
]

/**
 * 加载 assets/js-lib 下的全部第三方库到 $lib 对象。
 * 每个库在独立 vm 沙箱中执行，按注册表策略捕获导出。
 */
export function loadJsLib(): Record<string, any> {
  const $lib: Record<string, any> = {}

  for (const entry of LIB_REGISTRY) {
    const filePath = path.join(JS_LIB_DIR, entry.file)
    if (!fs.existsSync(filePath)) continue // 缺失文件跳过，不报错

    const code = fs.readFileSync(filePath, 'utf-8')

    // 为每个库创建独立沙箱，隔离 module.exports 与全局变量
    const sandbox: Record<string, any> = {
      module: { exports: {} },
      exports: {},
      console,
    }
    // 让 UMD / 环境探测正常工作：globalThis/global/self/window 指向沙箱自身
    sandbox.globalThis = sandbox
    sandbox.global = sandbox
    sandbox.self = sandbox
    sandbox.window = sandbox

    // 预注入已加载的依赖（如 CryptoJS），供 JSEncrypt / jsrsasign 作为全局引用
    if (entry.strategy.requires) {
      for (const dep of entry.strategy.requires) {
        if ($lib[dep] === undefined) {
          throw new Error(`加载 ${entry.file} 失败：依赖的 ${dep} 未加载（请检查对应库文件是否存在）`)
        }
        sandbox[dep] = $lib[dep]
      }
    }

    const ctx = vm.createContext(sandbox)
    vm.runInContext(code, ctx, { filename: entry.file })

    // 按策略捕获导出
    let exported: any
    const s = entry.strategy
    if (s.kind === 'umd') {
      const me = sandbox.module.exports
      exported = me && Object.keys(me).length > 0 ? me : sandbox[entry.name]
    } else if (s.kind === 'call') {
      const fn = sandbox[s.fn]
      if (typeof fn !== 'function') {
        throw new Error(`加载 ${entry.file} 失败：未找到包装函数 ${s.fn}()`)
      }
      exported = fn.call(sandbox)
    } else {
      // globals：取第一个已定义的全局变量
      for (const g of s.globals) {
        if (sandbox[g] !== undefined) {
          exported = sandbox[g]
          break
        }
      }
    }

    if (exported === undefined) {
      throw new Error(`加载 ${entry.file} 失败：未能捕获导出值（${entry.name}）`)
    }
    $lib[entry.name] = exported
  }

  return $lib
}

/** 返回已注册的库名列表（供调试 / 文档使用） */
export function listJsLibModules(): string[] {
  return LIB_REGISTRY.map((e) => e.name)
}
