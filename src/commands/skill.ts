import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `lingshu skill install`：把包内自带的 skill（如 `lingshu-plugin-dev`）装进
 * 各家 agent 的 skills 目录，全程不需要 `npx skills add`。
 *
 * 安装源就是本包（npm tarball 的 `skills/`，母仓则是 `lingshu-skills/`），
 * 与同包的 `$lib`/契约模板永不对位；目标是纯文件拷贝，无网络、无注册表。
 */

/** 支持的 agent 与其 skills 目录（全局 = 用户级，项目 = 仓库级） */
export interface SkillAgentTarget {
  /** `--agent` 用的名字 */
  id: string
  /** 全局目录相对 HOME 的路径段 */
  globalSegs: string[]
  /** 项目目录相对项目根的路径段 */
  projectSegs: string[]
}

export const SKILL_AGENTS: SkillAgentTarget[] = [
  // Claude Code：~/.claude/skills/（个人）· .claude/skills/（项目）
  { id: 'claude', globalSegs: ['.claude', 'skills'], projectSegs: ['.claude', 'skills'] },
  // Cursor：~/.cursor/skills/（用户级）· .cursor/skills/（项目级）
  { id: 'cursor', globalSegs: ['.cursor', 'skills'], projectSegs: ['.cursor', 'skills'] },
  // OpenAI Codex CLI：~/.codex/skills/ · .codex/skills/
  { id: 'codex', globalSegs: ['.codex', 'skills'], projectSegs: ['.codex', 'skills'] },
  // 通用目录（多家新 agent 认它；skills.sh 亦以它为全局正本）：~/.agents/skills/ · .agents/skills/
  { id: 'agents', globalSegs: ['.agents', 'skills'], projectSegs: ['.agents', 'skills'] },
]

export type SkillScope = 'global' | 'project'

export interface InstallSkillOptions {
  /** global = 装进 HOME 下各 agent 目录（默认）；project = 装进项目根 */
  scope?: SkillScope
  /** scope=project 时的项目根（缺省为当前工作目录） */
  dir?: string
  /** 只装这几家（缺省全部）；名字见 SKILL_AGENTS 的 id */
  agents?: string | string[]
  /** HOME 覆盖（单测注入；CLI 用 os.homedir()） */
  home?: string
  /** 已存在同名 skill 时是否覆盖 */
  force?: boolean
}

export interface InstallSkillResult {
  skill: string
  scope: SkillScope
  installed: string[]
  skipped: string[]
}

/**
 * 定位包内 skills 根目录。
 * 公开仓/npm 包布局：<包根>/skills；母仓源码布局：<仓根>/lingshu-skills。
 */
export function findSkillsRoot(): string | null {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.join(here, '..', '..', 'skills'),
    path.join(here, '..', '..', '..', 'lingshu-skills'),
  ]
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return c
    } catch {
      /* 继续下一个候选 */
    }
  }
  return null
}

/** 列出包内自带的 skill（子目录下有 SKILL.md 即算一个） */
export function listBundledSkills(skillsRoot?: string): string[] {
  const root = skillsRoot ?? findSkillsRoot()
  if (!root) return []
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => {
      try {
        return fs.statSync(path.join(root, name, 'SKILL.md')).isFile()
      } catch {
        return false
      }
    })
    .sort()
}

/** 解析 `--agent a,b`：未知名字直接抛错（ fail-fast，别静默装错地方） */
export function resolveSkillAgents(ids?: string | string[]): SkillAgentTarget[] {
  const arr = ids === undefined ? [] : Array.isArray(ids) ? ids : [ids]
  if (arr.length === 0) return SKILL_AGENTS
  const wanted = arr.flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean)
  const known = new Map(SKILL_AGENTS.map((a) => [a.id, a]))
  const unknown = wanted.filter((id) => !known.has(id))
  if (unknown.length > 0) {
    throw new Error(`未知的 agent：${unknown.join(', ')}（可选：${SKILL_AGENTS.map((a) => a.id).join(' / ')}）`)
  }
  return wanted.map((id) => known.get(id)!)
}

/**
 * 安装 skill 核心（可单测）：把 `<skillsRoot>/<skill>` 拷贝到目标 agent 目录。
 * 失败抛错（CLI 入口统一转 stderr + exit 1），成功返回落盘路径。
 */
export function installSkill(skillName: string | undefined, options: InstallSkillOptions = {}): InstallSkillResult {
  const skillsRoot = findSkillsRoot()
  if (!skillsRoot) {
    throw new Error('找不到包内 skills 目录（包安装不完整，请重装 lingshu-runtime）')
  }
  const bundled = listBundledSkills(skillsRoot)
  let skill = skillName
  if (!skill) {
    if (bundled.length === 1) skill = bundled[0]
    else throw new Error(`请指定 skill 名称（包内自带：${bundled.join(' / ') || '无'}）`)
  }
  const src = path.join(skillsRoot, skill)
  if (!bundled.includes(skill)) {
    throw new Error(`包内没有 skill "${skill}"（自带：${bundled.join(' / ') || '无'}）`)
  }
  const scope: SkillScope = options.scope ?? 'global'
  const targets = resolveSkillAgents(options.agents)
  const installed: string[] = []
  const skipped: string[] = []
  for (const t of targets) {
    const dest =
      scope === 'global'
        ? path.join(options.home ?? os.homedir(), ...t.globalSegs, skill)
        : path.join(options.dir ? path.resolve(options.dir) : process.cwd(), ...t.projectSegs, skill)
    if (fs.existsSync(dest) && !options.force) {
      skipped.push(dest)
      continue
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.rmSync(dest, { recursive: true, force: true })
    fs.cpSync(src, dest, { recursive: true })
    installed.push(dest)
  }
  return { skill, scope, installed, skipped }
}

/** `lingshu skill list` CLI 入口 */
export async function skillListCommand(): Promise<void> {
  const skills = listBundledSkills()
  if (skills.length === 0) {
    console.error('错误: 包内没有可用 skill（包安装不完整，请重装 lingshu-runtime）')
    process.exit(1)
  }
  console.log('包内自带 skill：')
  for (const s of skills) console.log(`  ${s}`)
}

/** `lingshu skill install` CLI 入口：失败即报错退出 */
export async function skillInstallCommand(
  skillName: string | undefined,
  options: { scope?: string; project?: boolean; dir?: string; agent?: string | string[]; force?: boolean },
): Promise<void> {
  try {
    if (options.scope !== undefined && options.scope !== 'global' && options.scope !== 'project') {
      throw new Error(`--scope 非法："${options.scope}"（只允许 global / project）`)
    }
    const scope: SkillScope = options.scope === 'project' || options.project ? 'project' : 'global'
    const result = installSkill(skillName, {
      scope,
      dir: options.dir,
      agents: options.agent,
      force: options.force,
    })
    for (const p of result.installed) console.log(`已安装: ${p}`)
    for (const p of result.skipped) console.log(`已存在（跳过，加 --force 覆盖）: ${p}`)
    if (result.installed.length === 0 && result.skipped.length > 0) {
      console.log('无需写入：目标均已是最新。')
    }
    console.log('')
    console.log('下一步：在 agent 对话里提到插件开发需求，skill 会自动生效；')
    console.log(`也可用 lingshu init ${result.skill === 'lingshu-plugin-dev' ? '<plugin-id>' : result.skill} 直接建插件骨架。`)
  } catch (err: any) {
    console.error(`错误: ${err?.message ?? err}`)
    process.exit(1)
  }
}
