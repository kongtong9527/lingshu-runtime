import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createUiAPI } from '../runtime/ui.js'
import { executeRun } from '../commands/run.js'
import type { UiPrompt, UiRequestHandler } from '../types.js'

const TMP = os.tmpdir()
const files: string[] = []

function writeFile(name: string, content: string): string {
  const p = path.join(TMP, name)
  fs.writeFileSync(p, content, 'utf-8')
  files.push(p)
  return p
}

afterEach(() => {
  for (const f of files.splice(0)) {
    try {
      fs.unlinkSync(f)
    } catch {
      /* 忽略 */
    }
  }
})

describe('createUiAPI 单元（注入 handler）', () => {
  it('showInputDialog 经 handler 收到 input prompt 并返回用户串', async () => {
    const seen: UiPrompt[] = []
    const handler: UiRequestHandler = async (p) => {
      seen.push(p)
      return p.kind === 'input' ? '1234' : undefined
    }
    const ui = createUiAPI(handler)
    const code = await ui.showInputDialog('验证码', {
      image: 'data:image/png;base64,AA',
      message: '请输入',
      placeholder: '4 位',
    })
    expect(code).toBe('1234')
    expect(seen[0]).toMatchObject({
      kind: 'input',
      title: '验证码',
      image: 'data:image/png;base64,AA',
      message: '请输入',
      placeholder: '4 位',
    })
  })

  it('confirm 返回所点按钮的 value（缺省回退 text）', async () => {
    const handler: UiRequestHandler = async (p) => (p.kind === 'confirm' ? 'apply' : undefined)
    const ui = createUiAPI(handler)
    const chosen = await ui.confirm('提示', '应用新线路?', [
      { text: '取消' },
      { text: '应用', value: 'apply' },
    ])
    expect(chosen).toBe('apply')
  })

  it('confirm 无 buttons 时默认 [取消, 确定]', async () => {
    const seen: UiPrompt[] = []
    const handler: UiRequestHandler = async (p) => {
      seen.push(p)
      return '确定'
    }
    const ui = createUiAPI(handler)
    const chosen = await ui.confirm('提示', '继续?')
    expect(chosen).toBe('确定')
    expect(seen[0].kind === 'confirm' && seen[0].buttons.map((b) => b.text)).toEqual(['取消', '确定'])
  })

  it('showMessage / launchUrl fire-and-forget 路由到 handler', async () => {
    const seen: UiPrompt[] = []
    const handler: UiRequestHandler = async (p) => {
      seen.push(p)
      return undefined
    }
    const ui = createUiAPI(handler)
    ui.showMessage('签到成功')
    ui.launchUrl('https://example.com/buy')
    await new Promise((r) => setTimeout(r, 0))
    expect(seen.map((p) => p.kind)).toEqual(['message', 'launchUrl'])
  })
})

describe('createUiAPI 无 handler（headless）', () => {
  it('input / confirm 清晰报错（不静默降级，避免吞 bug）', async () => {
    const ui = createUiAPI(undefined)
    await expect(ui.showInputDialog('验证码')).rejects.toThrow(/无 UI 信道/)
    await expect(ui.confirm('提示', '继续?')).rejects.toThrow(/无 UI 信道/)
  })

  it('message / launchUrl 静默 no-op（不抛错）', () => {
    const ui = createUiAPI(undefined)
    expect(() => ui.showMessage('x')).not.toThrow()
    expect(() => ui.launchUrl('https://example.com')).not.toThrow()
  })
})

// 合成插件：login 内 await $lib.ui.showInputDialog，镜像 ccc 验证码流（取图→等输入→提交）
const CAPTCHA_PLUGIN = `
// ==Plugin==
// id: captcha
// name: captcha
// version: 1.0.0
// ==EndPlugin==
function getAccountSchema() {
  return { loginFields: [{ name: 'user', label: '用户', type: 'text', required: true }] }
}
async function login(inputs) {
  const code = await $lib.ui.showInputDialog('验证码', { image: 'data:image/png;base64,AAAA', message: '请输入图中字符' })
  if (!code) throw new Error('验证码为空')
  return { uid: 'u1', message: 'code=' + code }
}
async function fetchList() { return { items: [] } }
async function fetchDetail(url) { return { title: url, sourceName: 's', sourceUrl: url, blocks: [] } }
module.exports = { id: 'captcha', name: 'captcha', version: '1.0.0', fetchList, fetchDetail, getAccountSchema, login }
`

describe('executeRun + $lib.ui 集成', () => {
  it('注入 onUiRequest 时，login 内 await showInputDialog 拿到人类输入并续跑', async () => {
    const file = writeFile('captcha.plugin.js', CAPTCHA_PLUGIN)
    const handler: UiRequestHandler = async (p) => (p.kind === 'input' ? 'Z9X8' : undefined)
    const result = await executeRun(file, 'login', undefined, { inputs: { user: 'a' }, onUiRequest: handler })
    expect(result).toEqual({ uid: 'u1', message: 'code=Z9X8' })
  })

  it('无 onUiRequest（headless）时，插件调 showInputDialog 清晰报错', async () => {
    const file = writeFile('captcha.plugin.js', CAPTCHA_PLUGIN)
    await expect(executeRun(file, 'login', undefined, { inputs: { user: 'a' } })).rejects.toThrow(/无 UI 信道/)
  })
})
