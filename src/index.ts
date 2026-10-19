#!/usr/bin/env node
import { Command } from 'commander'
import { packageVersion } from './pkg-version.js'
import { runCommand } from './commands/run.js'
import { listCommand } from './commands/list.js'
import { listingsCommand } from './commands/listings.js'
import { testCommand } from './commands/test.js'
import { initCommand } from './commands/init.js'
import { skillInstallCommand, skillListCommand } from './commands/skill.js'

const program = new Command()

program
  .name('lingshu')
  .description('灵枢插件模拟运行环境')
  .version(packageVersion())

program
  .command('run <plugin-id> <action> [target]')
  .description(
    '运行插件；action: list/detail/search/reading/play/categories/listings/explore/tags/setting-action/login/logout/me/invoke；target: detail/reading/play 的 URL、search 的查询词、setting-action 的字段 key、invoke 的方法名',
  )
  .option('--page <number>', '页码（list/search/tags 用，tags 为标签索引页码）', '1')
  .option('--cursor <token>', '游标分页令牌（list/search 用，回传上一页 pagination.nextCursor）')
  .option(
    '--category <filter>',
    '筛选组合串（list/search/tags 用，如 region=cn&type=rexue；tags 为索引页自己的筛选，如 type=album）',
  )
  .option('--url <url>', '页面通道（list 用）：任意列表页面 URL，插件按 URL 分派解析；explore 用：探索页标识（listings-first，getExplore 的 context.url）')
  .option('--channel <id>', '列表通道标识（ADR-0064）：原样透传进 PluginContext.channel，插件优先按它分派（缺省回退 URL 正则）')
  .option('--fixture <path>', '使用本地快照替代网络请求（list / detail / reading / play / categories / listings / explore / tags）；传目录则读 <dir>/index.json 的 routes 按 URL 逐条匹配，多跳流程用这个')
  .option('--settings <json>', '用户偏好 JSON（注入 $lib.settings，如 \'{"apiLine":"2","hd":true}\'）')
  .option('--inputs <json>', '登录表单输入 JSON（login 用，如 \'{"username":"x","password":"y"}\'）')
  .option('--params <json>', '通用调用参数 JSON（invoke 用，如 \'{"userId":"1","active":true}\'）')
  .option('--dir <path>', '插件目录路径')
  .action(async (pluginId: string, action: string, target: string | undefined, cmdOpts: any) => {
    // 把 --settings '<json>' 字符串解析为对象，再交给 runCommand（其 options 类型为 RunOptions）
    let settings: Record<string, string | boolean> | undefined
    if (cmdOpts.settings) {
      try {
        const parsed = JSON.parse(cmdOpts.settings)
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('应为 JSON 对象')
        }
        settings = parsed as Record<string, string | boolean>
      } catch (e: any) {
        console.error('错误: --settings 不是有效的 JSON 对象:', e?.message ?? e)
        process.exit(1)
      }
    }
    // 同理把 --inputs '<json>' 解析为字符串字典（login 动作用）
    let inputs: Record<string, string> | undefined
    if (cmdOpts.inputs) {
      try {
        const parsed = JSON.parse(cmdOpts.inputs)
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('应为 JSON 对象')
        }
        inputs = parsed as Record<string, string>
      } catch (e: any) {
        console.error('错误: --inputs 不是有效的 JSON 对象:', e?.message ?? e)
        process.exit(1)
      }
    }
    // 同理把 --params '<json>' 解析为对象（invoke 动作用）
    let params: Record<string, unknown> | undefined
    if (cmdOpts.params) {
      try {
        const parsed = JSON.parse(cmdOpts.params)
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('应为 JSON 对象')
        }
        params = parsed as Record<string, unknown>
      } catch (e: any) {
        console.error('错误: --params 不是有效的 JSON 对象:', e?.message ?? e)
        process.exit(1)
      }
    }
    await runCommand(pluginId, action, target, { ...cmdOpts, settings, inputs, params })
  })

program
  .command('init <plugin-id>')
  .alias('new')
  .description('在任意目录生成新插件骨架（<id>.plugin.js + _fixtures/<id>/），全局安装后开发入口')
  .option('--dir <path>', '目标目录（缺省为当前工作目录）')
  .option('--force', '已存在同名文件时覆盖')
  .action(initCommand)

program
  .command('list')
  .description('列出所有可用插件')
  .option('--dir <path>', '插件目录路径')
  .action(listCommand)

const skill = program.command('skill').description('开发技能包管理（包内自带，无需 npx skills）')

skill
  .command('install [skill-name]')
  .description('把包内 skill 装进各家 agent 的 skills 目录（默认全局全部 agent）')
  .option('--scope <scope>', '安装范围：global（用户级，默认）/ project（项目级）')
  .option('--project', '装进项目级目录（等价 --scope project；--dir 指定项目根，缺省当前目录）')
  .option('--dir <path>', 'scope=project 时的项目根目录')
  .option('--agent <names>', '只装这几家（逗号分隔，claude/cursor/codex/agents；缺省全部）')
  .option('--force', '已存在同名 skill 时覆盖')
  .action(skillInstallCommand)

skill
  .command('list')
  .description('列出包内自带的 skill')
  .action(skillListCommand)

program
  .command('test <plugin-id>')
  .description('校验插件格式（元数据 + 接口完整性）')
  .option('--dir <path>', '插件目录路径')
  .action(testCommand)

program
  .command('listings <plugin-id>')
  .description('校验插件 getListings：递归验证导航树（children/分组），叶子跑 fetchList({category}) 或 fetchList({url}) 验证可出条目')
  .option('--dir <path>', '插件目录路径')
  .option('--fixture <path>', '使用本地快照替代网络请求（文件 = 逐条 fetchList 共用同一 fixture；目录 = 按 URL 匹配 <dir>/index.json 的 routes）')
  .action(listingsCommand)

program.parse()
