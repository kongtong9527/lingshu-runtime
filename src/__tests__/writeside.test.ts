import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { executeRun } from '../commands/run.js'

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

// 合成插件：通用调用回显（不走网络），专测 invoke 分派与参数透传
const WRITE_PLUGIN = `
// ==Plugin==
// id: fakewrite
// name: fakewrite
// version: 1.0.0
// ==EndPlugin==
async function fetchList() { return { items: [] } }
async function fetchDetail(url) { return { title: url, sourceName: 's', sourceUrl: url, blocks: [] } }
async function getMe() { return { user: { id: '1', nickname: 'n' }, states: { 'k1': true } } }
async function setUserState(params) { return { active: !!params.active } }
async function echo(params) { return { got: params } }
async function logout() { return { message: '已退出登录' } }
module.exports = { id: 'fakewrite', name: 'fakewrite', version: '1.0.0', fetchList, fetchDetail, getMe, setUserState, echo, logout }
`

describe('通用调用分派（me/invoke/logout）', () => {
  it('me 分派到 plugin.getMe()', async () => {
    const file = writeFile('fakewrite.plugin.js', WRITE_PLUGIN)
    const result = await executeRun(file, 'me', undefined, {})
    expect(result.user.id).toBe('1')
  })

  it('logout 分派到 plugin.logout()', async () => {
    const file = writeFile('fakewrite.plugin.js', WRITE_PLUGIN)
    expect(await executeRun(file, 'logout', undefined, {})).toEqual({ message: '已退出登录' })
  })

  it('invoke 直调插件同名导出并透传 params', async () => {
    const file = writeFile('fakewrite.plugin.js', WRITE_PLUGIN)
    expect(await executeRun(file, 'invoke', 'echo', { params: { a: 1 } })).toEqual({ got: { a: 1 } })
    expect(await executeRun(file, 'invoke', 'setUserState', { params: { userId: '123', active: true } })).toEqual({ active: true })
    expect(await executeRun(file, 'invoke', 'setUserState', { params: { userId: '123', active: false } })).toEqual({ active: false })
  })

  it('invoke 缺方法名时报错', async () => {
    const file = writeFile('fakewrite.plugin.js', WRITE_PLUGIN)
    await expect(executeRun(file, 'invoke', undefined, {})).rejects.toThrow(/方法名/)
  })

  it('插件未实现写侧方法时优雅报错', async () => {
    const file = writeFile('nowrite.plugin.js', `
// ==Plugin==
// id: nowrite
// name: n
// version: 1.0.0
// ==EndPlugin==
      async function fetchList() { return { items: [] } }
      async function fetchDetail(url) { return { title: url, sourceName: 's', sourceUrl: url, blocks: [] } }
      module.exports = { id: 'nowrite', name: 'n', version: '1.0.0', fetchList, fetchDetail }
    `)
    await expect(executeRun(file, 'me', undefined, {})).rejects.toThrow(/不支持 getMe/)
    await expect(executeRun(file, 'logout', undefined, {})).rejects.toThrow(/不支持 logout/)
    await expect(executeRun(file, 'invoke', 'setUserState', {})).rejects.toThrow(/插件不支持 setUserState/)
  })
})
