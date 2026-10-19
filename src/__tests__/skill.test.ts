import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  installSkill,
  listBundledSkills,
  findSkillsRoot,
  resolveSkillAgents,
} from '../commands/skill.js'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try {
      fs.rmSync(d, { recursive: true, force: true })
    } catch {
      /* 忽略 */
    }
  }
})

function freshDir(prefix: string): string {
  const d = path.join(os.tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${dirs.length}`)
  fs.mkdirSync(d, { recursive: true })
  dirs.push(d)
  return d
}

describe('包内 skill 发现', () => {
  it('findSkillsRoot 在母仓/快照布局下能定位', () => {
    expect(findSkillsRoot()).not.toBeNull()
  })

  it('listBundledSkills 含 lingshu-plugin-dev 且带 SKILL.md', () => {
    const skills = listBundledSkills()
    expect(skills).toContain('lingshu-plugin-dev')
    const root = findSkillsRoot()!
    expect(fs.existsSync(path.join(root, 'lingshu-plugin-dev', 'SKILL.md'))).toBe(true)
  })
})

describe('resolveSkillAgents', () => {
  it('缺省全选四家', () => {
    expect(resolveSkillAgents().map((a) => a.id)).toEqual(['claude', 'cursor', 'codex', 'agents'])
  })

  it('逗号字符串与数组都支持，未知名字抛错', () => {
    expect(resolveSkillAgents('claude,cursor').map((a) => a.id)).toEqual(['claude', 'cursor'])
    expect(resolveSkillAgents(['codex']).map((a) => a.id)).toEqual(['codex'])
    expect(() => resolveSkillAgents('not-an-agent')).toThrow(/未知/)
  })
})

describe('installSkill（包内 skill 拷到 agent 目录）', () => {
  it('global：写进伪造 HOME 下四家目录，内容与包内一致', () => {
    const home = freshDir('lingshu-skill-home')
    const result = installSkill(undefined, { home })
    expect(result.skill).toBe('lingshu-plugin-dev')
    expect(result.scope).toBe('global')
    expect(result.installed).toHaveLength(4)
    for (const p of result.installed) {
      expect(fs.existsSync(path.join(p, 'SKILL.md'))).toBe(true)
    }
    // spot check：frontmatter 跟包内源一致（装过去的不是旧副本）
    const src = fs.readFileSync(
      path.join(findSkillsRoot()!, 'lingshu-plugin-dev', 'SKILL.md'),
      'utf8',
    )
    const dst = fs.readFileSync(path.join(result.installed[0], 'SKILL.md'), 'utf8')
    expect(dst).toBe(src)
  })

  it('缺省 skill 名时包内唯一即默认选中；多 skill 时必须显式指定', () => {
    const home = freshDir('lingshu-skill-home2')
    // 当前包内只有一个 skill：缺省即它
    expect(installSkill(undefined, { home }).skill).toBe('lingshu-plugin-dev')
    // 不存在的 skill 名直接拒绝
    expect(() => installSkill('no-such-skill', { home })).toThrow(/没有 skill/)
  })

  it('同名已存在时跳过（skipped），加 --force 才覆盖', () => {
    const home = freshDir('lingshu-skill-home3')
    const first = installSkill('lingshu-plugin-dev', { home, agents: ['claude'] })
    expect(first.installed).toHaveLength(1)
    const second = installSkill('lingshu-plugin-dev', { home, agents: ['claude'] })
    expect(second.installed).toHaveLength(0)
    expect(second.skipped).toHaveLength(1)
    const third = installSkill('lingshu-plugin-dev', { home, agents: ['claude'], force: true })
    expect(third.installed).toHaveLength(1)
  })

  it('project：写进项目根的四家项目级目录，不碰 HOME', () => {
    const home = freshDir('lingshu-skill-home4')
    const proj = freshDir('lingshu-skill-proj')
    const result = installSkill('lingshu-plugin-dev', { scope: 'project', dir: proj, home })
    expect(result.scope).toBe('project')
    expect(result.installed).toHaveLength(4)
    for (const p of result.installed) {
      expect(p.startsWith(proj)).toBe(true)
      expect(fs.existsSync(path.join(p, 'SKILL.md'))).toBe(true)
    }
    // HOME 下无写入
    expect(fs.existsSync(path.join(home, '.claude'))).toBe(false)
  })

  it('--agent 可收窄到一家', () => {
    const home = freshDir('lingshu-skill-home5')
    const result = installSkill('lingshu-plugin-dev', { home, agents: ['cursor'] })
    expect(result.installed).toEqual([path.join(home, '.cursor', 'skills', 'lingshu-plugin-dev')])
  })

  it('显式 skill 名与缺省一致', () => {
    const home = freshDir('lingshu-skill-home6')
    expect(installSkill('lingshu-plugin-dev', { home, agents: ['agents'] }).skill).toBe(
      'lingshu-plugin-dev',
    )
  })
})
