import vm from 'node:vm'
import { createHttpAPI, type RequestRecorder, type CookieJar } from './runtime/http.js'
import { createBrowserAPI } from './runtime/browser.js'
import { createStorageAPI } from './runtime/storage.js'
import { createSettingsAPI, type SettingValue } from './runtime/settings.js'
import { createUtilAPI } from './runtime/util.js'
import { createUiAPI } from './runtime/ui.js'
import { createZlibAPI } from './runtime/zlib.js'
import { loadJsLib } from './lib-loader.js'
import type { UiRequestHandler } from './types.js'

export interface SandboxOptions {
  timeout?: number
  /** 收集插件内 $lib.http.get/post/del 的每次请求记录（供 DevConsole 展示） */
  onRequest?: RequestRecorder
  /**
   * 用户偏好值（按 run 注入，只读、不持久）。
   * 宿主把当前设置表单的值传入，插件经 `$lib.settings.get(key)` 读取；
   * 缺失时 `$lib.settings.get` 恒返回 undefined（插件套自己的默认值）。
   */
  settings?: Record<string, SettingValue>
  /**
   * 共享 cookie jar：传入则跨 run 复用（登录 run 写入的 session cookie，
   * 后续读取 run 可带上）。缺省每次 run 新建短命 jar。。
   */
  cookieStore?: CookieJar
  /**
   * $lib.ui 的宿主处理器：插件中途直问用户（验证码/确认/toast/开链接）时，
   * 经此回调向宿主要结果。DevConsole 桥接到前端、测试返回 canned 响应；
   * 缺省时 input/confirm 清晰报错、message/launchUrl 静默 no-op。
   */
  onUiRequest?: UiRequestHandler
}

export interface Sandbox {
  context: vm.Context
  /** 暴露 $lib，便于调用方（如 CLI 的 fixture 模式、测试）覆盖 $lib.http.get 等 */
  $lib: Record<string, any>
  runInContext(code: string, filename: string): any
}

/**
 * 创建插件执行沙箱。
 *
 * $lib = 原生注入（http / storage）+ js-lib 已加载好的全部第三方库。
 * 危险宿主能力（require / process / Buffer / 定时器等）被屏蔽，
 * 插件代码只能通过 $lib 访问受控的运行时 API。
 *
 * 安全边界声明：
 * 本沙箱基于 node:vm，仅用于开发期隔离与危险 API 屏蔽，不是安全边界。
 * node:vm 的上下文与宿主共享同一进程与 V8 堆，存在原型链逃逸
 * （如 this.constructor.constructor('return process')()）与动态 import
 * 等逃逸路径，不可信插件仍可能突破到宿主。因此不要用本沙箱执行真正不可信
 * 的插件；生产环境应改用 isolated-vm 或 Swift JavaScriptCore 等真正的隔离运行时。
 */
export function createSandbox(options?: SandboxOptions): Sandbox {
  const timeout = options?.timeout ?? 30000

  // $lib = 原生注入（http/storage/settings/util）+ js-lib 已加载的全部库
  const $lib: Record<string, any> = {
    http: createHttpAPI(options?.onRequest, options?.cookieStore),
    browser: createBrowserAPI(),
    storage: createStorageAPI(),
    settings: createSettingsAPI(options?.settings),
    util: createUtilAPI(),
    ui: createUiAPI(options?.onUiRequest),
    zlib: createZlibAPI(),
    ...loadJsLib(),
  }

  // 沙箱全局：提供 $lib 与 console，屏蔽宿主危险能力
  const sandbox: Record<string, any> = {
    $lib,
    console: { ...console },
    // 屏蔽：插件不得直接访问宿主
    require: undefined,
    process: undefined,
    Buffer: undefined,
    setTimeout: undefined,
    setInterval: undefined,
    setImmediate: undefined,
    clearTimeout: undefined,
    clearInterval: undefined,
    clearImmediate: undefined,
  }

  const context = vm.createContext(sandbox)
  // globalThis/global 指向沙箱自身，使插件内 globalThis.$lib 可达
  sandbox.globalThis = context
  sandbox.global = context

  return {
    context,
    $lib,
    runInContext(code: string, filename: string) {
      return vm.runInContext(code, context, { filename, timeout })
    },
  }
}
