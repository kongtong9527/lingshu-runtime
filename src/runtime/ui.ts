import type { UiPrompt, UiRequestHandler, UiResponse, UiButton } from '../types.js'

/**
 * 创建 $lib.ui 运行时：插件在 run 中途直问用户的交互信道。
 *
 * 与 `$lib.http` 同构——都是「暂停 run、等外部系统返回」的异步原语：
 * http 暂停等网络，ui 暂停等人类。`onUiRequest` 由宿主提供：
 *   - DevConsole：桥接到前端，渲染对话框/输入框/toast，收齐人类输入后 resolve。
 *   - 测试/CI：返回 canned 响应（等价 HTTP fixture 回放）。
 *   - CLI 无 handler：input/confirm 清晰报错（headed 原语要求人类，不静默降级）；
 *     message/launchUrl 静默 no-op（不返回插件依赖的值，不藏 bug）。
 *
 * 窄口径：仅收「插件直问」类（验证码/确认/toast/开链接），不含结构化选择器（那是多 run 流）。
 * 详见 runtime/AGENTS.md「$lib.ui 运行时」。
 */
export function createUiAPI(onUiRequest?: UiRequestHandler) {
  async function request(prompt: UiPrompt): Promise<UiResponse> {
    if (!onUiRequest) {
      if (prompt.kind === 'input' || prompt.kind === 'confirm') {
        throw new Error(
          `$lib.ui.${prompt.kind} 需要交互式宿主，当前环境无 UI 信道（headless：请在 DevConsole 运行，或提供 ui fixture 回放）`,
        )
      }
      // message / launchUrl：无 handler 时静默 no-op（非关键副作用，不藏 bug）
      return undefined
    }
    return onUiRequest(prompt)
  }

  return {
    async showInputDialog(
      title: string,
      options?: { message?: string; image?: string; placeholder?: string },
    ): Promise<string> {
      const res = await request({
        kind: 'input',
        title,
        message: options?.message,
        image: options?.image,
        placeholder: options?.placeholder,
      })
      // 宿主未返回串时兜底空串（与「用户留空」不可区分，由插件自行判空）
      return typeof res === 'string' ? res : ''
    },

    async confirm(title: string, message: string, buttons?: UiButton[]): Promise<string> {
      const btns: UiButton[] = buttons && buttons.length ? buttons : [{ text: '取消' }, { text: '确定' }]
      const res = await request({ kind: 'confirm', title, message, buttons: btns })
      // 宿主返回所点按钮的 value（缺省 text）；未返回时取第一个按钮作兜底
      if (typeof res === 'string' && res) return res
      const first = btns[0]
      return first.value ?? first.text
    },

    showMessage(text: string): void {
      // fire-and-forget：不等宿主，避免阻塞 run；无 handler 静默 no-op
      if (onUiRequest) onUiRequest({ kind: 'message', text }).catch(() => {})
    },

    launchUrl(url: string): void {
      if (onUiRequest) onUiRequest({ kind: 'launchUrl', url }).catch(() => {})
    },
  }
}
