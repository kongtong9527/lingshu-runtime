# ADR-0052：挑战识别下沉宿主（Cloudflare 通用错误类型）

> ADR-0060：本文「插件只剩重抓策略 + 解析兜底」的**重抓部分退役**——插件改
> **纯直连 + 挑战直抛**（浏览器重抓腿删）；判定表下沉与「禁插件自写判定」不变。

## 背景

anime_site_a 与 video_site_f 各写一遍 `isBlockedResponse` + `hasRealContent` + `challengeError`
（约 30 行同构代码），movie_site_c 另写一套裸错（无 `code`，进不了 iOS 验证链路）；
simulator `$lib.browser` 桩文案还写死 `anime_site_a:` 前缀误导他站。用户要求：
定义一个 Cloudflare 通用错误类型，不再每插件重写（grill-with-docs 共识，2026-09，
结论：判断下沉 `lib.http.get`，四条全按推荐锁定）。

## 决策

挑战识别 + 报错是**宿主职责**，插件只剩重抓策略 + 解析兜底：

- 共享判定表（simulator `runtime/challenge.ts`，iOS `ChallengeDetector.responseMarkers`
  同表对照）：`status ∈ {403, 503}` +（`cf-mitigated` 头 或 正文前 4KB 强特征串
  `just a moment` / `attention required` / `cf-chl` / `cf-error` / `cf-mitigated` /
  `challenges.cloudflare.com`）。**剔除 `challenge-platform` 与 `<!doctype html`**：
  前者正常页也被注入（anime_site_a 半信任 403 + 真内容实证，无区分度），后者任何 HTML
  页都有（等于"403 即挑战"，误杀普通 403）；真挑战页恒有强信号。
- 抛错点（三处，同一构造器 `challengeError(url, status)`，`Lingshu:` 中性前缀 +
  `CHALLENGE` token + URL 全串，`code`/`url` 双设）：
  simulator `$lib.http.get/post/del` 出口（`runtime/http.ts`）、`$lib.browser` 边界
  （`commands/run.ts` 包 `onBrowserFetch` 处——通道实现只管原文透出）、
  iOS `HttpBridge` + `BrowserBridge`（`JSContext.makeChallengeError`）。
  DevConsole 通道实现保持原文 resolve（其判定在 `$lib` 边界做）；`proxy.ts`
  只标记不抛（播放链路防缓存挑战页当媒体，语义不变）。
- 插件新形态（见技能包 `api-reference.md`「Cloudflare 挑战」节）：`request()` =
  直连优先 + `CHALLENGE` 才 1 次 browser 重抓 + 归一化（浏览器非挑战失败记 warn
  回抛直连错）；`assertParsed(url, res, got)` 通用失败判定（4xx/5xx 且解析不出内容
  才抛错）；路由级指引只以前缀改写 `e.message`（保留 `code`/`url`）。

## 否决的备选

1. **插件经 opts 传 `hasRealContent` validator 给宿主**：iOS 桥经 `toObjectDict()`
   取参，JS 函数过不去；改桥直读函数属性并跨 `jsQueue` 回调，复杂度爆炸。死刑。
2. **宿主 `http.get` 内部自动 browser 回退**：http↔browser 层耦合，fixture 短路、
   CLI 纯 Node 语义（ADR-0045）、DevConsole 按 run 透传的 mode 全要塞进 http 层；
   且"判断下沉"不等于"策略下沉"，Q9C 单次计数与模式选择保持插件可见。否决。
3. **skill 给复制模板 / 仅统一契约**：零宿主改动但"重写一遍"原样保留，口径靠人肉同步，
   分叉复发。用户原话否决。

## 后果

- anime_site_a/video_site_f 删判定函数与站名前缀错（`assertNotBlocked`/`isBlockedResponse`/
  `hasRealContent`/`challengeError` 清零）；movie_site_c 裸错改为宿主 CHALLENGE +
  路由指引前缀（行为变化：筛选路由被拦时 iOS 从普通失败变为弹验证页，已与用户确认）。
- 半信任 403 + 真内容宿主天然放行（旧世界站内标题/`__NEXT_DATA__` 前置否定门退役）。
- 旧 ADR（0042–0046）中"交插件 assertNotBlocked"表述为历史记录，不改；活文档
  （browser-channel、http-bridge、pitfalls、api-reference）已同步。
- 构建债：`simulator tsc` 曾被 `login-required.test.ts` 两处类型错误阻塞（插件真有
  `setUserState`/`setPostState`，`LingshuPlugin` 类型未收），本 ADR 顺手修测试侧断言
  取用方式（源码类型不动），构建恢复。
