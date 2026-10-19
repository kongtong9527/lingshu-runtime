// 灵枢 runtime 编程式 API 入口（供 DevConsole 等 Node 宿主复用）
// CLI 入口仍是 src/index.ts，互不影响。

export { executeRun, findPluginFile, resolvePluginDir } from './commands/run.js'
export type { RunOptions } from './commands/run.js'
export { loadPlugin } from './plugin-loader.js'
export type { LoadedPlugin } from './plugin-loader.js'
export { parsePluginMeta } from './types.js'
// 卡片 DSL 校验：DevConsole 预览的「整卡回退」判定必须与本出口同源，
// 禁各宿主自写一套（曾出现「未知 root」三端判得不一样，见 contracts/conformance/card-root.json）
export { validateCardDSL, shouldFallbackCard, CARD_LIMITS } from './card-dsl.js'
export type { CardValidation } from './card-dsl.js'
export type { HttpRecord, RequestRecorder, CookieJar } from './runtime/http.js'
export {
  isChallengeResponse as isChallengeProbe,
  hasMitigatedHeader,
  challengeMessage,
  challengeError,
  CHALLENGE_SIGNATURES,
  CHALLENGE_STATUSES,
  CHALLENGE_HEAD_BYTES,
} from './runtime/challenge.js'
export type { ChallengeProbe } from './runtime/challenge.js'
// 契约类型**全量**公开：types.ts 是所有宿主的类型来源，此处不再手工维护白名单
// （曾因漏列 CategoryFilterDisplay / TagContext / TagResult 让 devconsole 报 TS2305；
// 新增类型零改动即可被消费方 import）。值导出仍逐个具名、不 export *。
export type * from './types.js'
