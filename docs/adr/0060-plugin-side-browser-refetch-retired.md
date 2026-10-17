# ADR-0060：插件侧弃用浏览器重抓（纯直连 + 挑战直抛，宿主验证入口接管）

> 重写 ADR-0052 的插件侧条款，并退役 ADR-0043 §1、ADR-0044 §2、ADR-0045 §2/§3 里
> 「插件自带重抓腿」的前提；这四条的**宿主侧部分继续有效**（见「后果」）。当前插件语义
> 见 `lingshu-skills/lingshu-plugin-dev/references/api-reference.md`「Cloudflare 挑战」节。

## 背景

ADR-0043 给列表/详情链路落了**插件显式**浏览器通道（`$lib.browser.getHtml`，直连 403 →
存在即用、单会话最多 1 次重抓）；ADR-0044（可见手过验证）与 ADR-0045（桌面 headed
sidecar）都设计成「**复用插件的重试链**」——人过验证后的那次重抓发生在插件里；
ADR-0052 把挑战识别与报错下沉宿主后，插件侧剩下的正好就是这条重抓腿 + 归一化。

2026-10 复核后，这条腿站不住了，三条独立理由：

1. **能过挑战的是「与抓取同网络栈的浏览器」，不是插件**。ADR-0044 的真机结论是
   clearance 绑 TLS 指纹且**单页有效**——人工过 Turnstile 后已加载文档可读，任何新请求
   （自动导航 / 页内 fetch，不分路径）一律 403；ADR-0046 进一步证明「按窗口计数」的站
   连同窗口第二次请求都过不去。三条对应的解法全在**宿主侧**：同 store 同 UA 的可见 WK、
   headed sidecar、一次性抓取上下文。插件侧那条腿拿不到任何额外能力。
2. **插件重抓自带成本，且撞反爬红线**：每次 `CHALLENGE` 都白烧一次浏览器抓取
   （anime_site_a 按窗口计数，烧的是同一份声誉），换回来的是注定 403 的回包。
3. **归一化本身就是 ADR-0052 要消灭的那类插件侧判定**：旧形态要求插件把「直连已证挑战后
   浏览器腿的非挑战失败」改写回直连错（防验证入口丢 URL）——每个 L3 插件都得抄一遍。

于是 `02a8a91`（2026-10-10）把 anime_site_a / video_site_i 的重抓分支整段删除、skill 立规
「到万不得已禁止用 `$lib.browser.getHtml`」，模板与文档同步为纯直连主形态。本 ADR 把
这次改动从提交信息提升为可引用的决策。

## 决策

1. **插件标准形态 = 纯直连**：`request()` 只做 `$lib.http.get`；挑战由宿主在 `$lib.http`
   边界抛统一 `CHALLENGE`（ADR-0052 不变），插件**原样上抛**——不捕获、不重抓、不改写。
   插件侧不再有 `hasBrowserChannel` / `browserTried` / 归一化分支。
2. **`$lib.browser.getHtml` 降为「万不得已」例外**，同时满足两条才准用（与
   `api-reference.md` 同文，改一处必须同步另一处）：① clearance 绑 TLS 指纹
   （同机同 UA 全套头 curl 复核仍 403，复用无解）；② 验证后回填 + UA 对齐仍救不了
   （即宿主补丁无效，以真机实测为准）。现存唯一待定项是 anime_site_a（真机待验，不行回退）；
   video_site_f（UA 绑定）与 video_site_i（无绑定实证）已切纯直连。例外形态（直连优先 + 最多 1 次重抓）
   留 git 历史（`02a8a91` 之前），**启用前必须先过真机验证**。
3. **通道不删，归属改宿主**：`$lib.browser` 的注入面保留（iOS `BrowserBridge` /
   `HlsCookieWarmer`、DevConsole headed sidecar 仍要它），但**调用方从插件改成宿主验证链**：
   挑战态点「已验证，重新加载」后由宿主回填 jar（**无 browser 腿亦回填**，video_site_f 硬关版已验），
   重试走插件的纯直连请求。
4. **宿主侧限次语义不动**：单会话最多 1 次浏览器抓取（防自动导航连带封首页）继续由宿主
   串行链保证；只是不再由插件的 `browserTried` 计数。
5. **解析兜底不变**：半信任 403 + 真内容（无强信号）照常 resolve，插件按「解析出条目即成功」
   （`assertParsed`）兜底，**不写否定门**。

## 插入点

- 插件侧：`anime_site_a.plugin.js`（删 `hasBrowserChannel` + 重抓分支）、
  `video_site_i.plugin.js`（同）、`video_site_f.plugin.js`（硬关浏览器通道）。文档见
  `references/api-reference.md`「Cloudflare 挑战」节 + `references/pitfalls.md`
  「全站 Cloudflare 拦截（L3）」。
- 宿主侧：零改动（通道与回填链路原样，只是调用方变了）。
- 术语：`CONTEXT.md`「挑战策略 (Challenge Policy)」（原「重抓策略」正名）。

## 后果

- **退役条款**：ADR-0043 §1「插件显式调用 + 存在即用重抓」、ADR-0044 §2「复用插件
  `request()` 重试链」、ADR-0045 §2/§3「插件自带重抓腿 / 插件零改」、ADR-0052
  「插件只剩重抓策略 + 解析兜底」。
- **继续有效的**：ADR-0043 的显式通道与 `BrowserBridge`、ADR-0044 的可见手过 Sheet
  （同 store 同 UA + 被动触发 + 取消不重试 + 仍 403 回挑战态）、ADR-0045 的 headed sidecar
  薄注入与 `--browser` 不进 simulator、ADR-0046 的一次性抓取上下文、ADR-0052 的判定表
  三端共享与「禁插件自写判定」、ADR-0053 §3.13 的隐藏 WebView 空闲即销毁。
- 影响面：anime_site_a / video_site_i / video_site_f 三个写过重抓腿的插件；其余插件本来就没有这条腿，
  零改动。simulator 侧只动文档与一条测试——那条测试原先断言的正是被删的行为
  （「直连 CHALLENGE + 浏览器回真内容」），已改为断言「CHALLENGE 原样上抛 +
  `$lib.browser.getHtml` **零调用**」（`anime_site_a-403-content.test.ts`）。
- **待验证**：anime_site_a 是真·TLS 绑定站，验证后纯直连是否真能沾上宿主回填（真机）；
  不行则按 §2 回退例外形态，回退前先过真机、并把回退理由写回本节。

## 否决线（勿回退）

- 插件侧重抓腿（能力探测 + 单次重抓 + 归一化）——本 ADR 退役的就是它。
- 插件侧自写挑战判定（`isBlockedResponse` / `challengeError` / `hasRealContent` 式否定门）
  ——ADR-0052 已否决，本 ADR 不松口。
- 用「插件重抓」替代宿主验证入口：验证入口是宿主展示层能力（前项可见手过 + 后项系统
  浏览器），插件抛不出那个 UI。
- 对 `$lib.http` 自动切浏览器通道（透明回退）——ADR-0043/0045 已否决，继续否决。
