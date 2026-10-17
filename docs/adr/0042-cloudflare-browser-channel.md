# ADR-0042：Cloudflare 拦截分级与浏览器通道

## 背景

manga_site_a（key.bin 单资源挑战）、movie_site_a（视频 CDN 全链挑战）、movie_site_c（`/show/` 路由拦截）各修各的，
没有统一信条。anime_site_a.me 把天花板捅穿（2026-09 frx-director + curl 三轮实测，见 `anime_site_a.plugin.js`
文件头与 `_fixtures/anime_site_a/`）：

1. 全站 Managed Challenge（`cf-mitigated: challenge`）+ WAF block 页（Attention Required!）；
2. `cf_clearance` 全套 cookie + 同 UA + 全套浏览器头经 curl/undici 重放仍 403
   —— clearance 绑定 TLS 指纹，**Node 通道对此类站点彻底无解**；
3. 浏览器人工过 Turnstile 后 clearance 单页有效：已加载文档可读，任何新请求一律 403
   （WAF 分辨自动/人手加载）。

## 决策

1. **拦截分三级，按级处置**（升级即换档，不跨级复用手段）：
   - L1 单资源挑战（如 manga_site_a key.bin）：清单/分片 Node 可达，只有密钥被拦 → 浏览器直连密钥
    （DevConsole 已有：`#EXT-X-KEY` URI 不进代理；现状保持）。
   - L2 资源链挑战（如 movie_site_a 视频 CDN 全链）：列表/详情接口 Node 可达，只有媒体 CDN 被拦 →
     插件选浏览器可达源 + 代理对挑战响应打标记透传（本 ADR 落地 `isChallengeResponse`），
     不冒充、不缓存挑战页。
   - L3 全站挑战（anime_site_a）：列表/详情 Node 全灭 → **插件只做识别 + 如实报错**
    （`assertNotBlocked` 模式：403 + `cf-mitigated`/特征串 → 抛可操作错误，指引浏览器通道
     或 `--fixture` 离线验证），在线抓取等浏览器通道。
2. **Cookie 复用列为已否决路线**（L3）：同机、同 IP、全套 cookie、 matching UA、齐浏览器头，
   curl 依然 403。`anime_site_aDownLoad` 类工具的"粘贴 Cookie"做法在本栈（undici TLS 指纹）下不成立，
   不再投入；`$lib.http.setCookies` 保留给登录态（认证读侧），不用于过挑战。
3. **浏览器通道（三端落点，anime_site_a 插件转正的前置）**：
   - DevConsole：本 ADR 只做最小实现——代理识别挑战响应（`isChallengeResponse`，31 测试覆盖），
     跳过重写/解密/缓存兜底 + `x-lingshu-challenge: cloudflare` 标记头（路由层已透传）。
     后续：插件 run（`/api/run` 的 `$lib.http`）与代理的浏览器 backed 模式（无头浏览器 sidecar 或
     前端 fetch 中继），另立项。
   - iOS：已有 `HlsCookieWarmer`（WKWebView 网络栈过挑战）与 `isChallengeHTML` 判定；
     L3 需要把 warmer 从"密钥/清单"推广到"列表/详情抓取"，在 iOS 排期，不阻塞插件骨架上线。
   - simulator CLI：纯 Node，无浏览器可依；L3 站点在 CLI 下永远只能离线 fixture 验证，
     如实报错即正确行为，不视为缺陷。
4. **红线**：任何"看起来通了"的降级（缓存挑战页当媒体、静默回退未筛选列表、吞掉 403 当空列表）
   一律禁止；不可达就明说（movie_site_c `/show/` 先例）。

## 后果

- anime_site_a 以骨架版上线（离线全绿：explore/list/detail/search/play/categories/url-channel；
  在线抛指引错），转正条件 = 任一宿主浏览器通道就绪 + 在线复核（referer 校验、sort `+` 编码、
  secure= 时效、详情 playlist 上限）。
- L1/L2 存量行为零回归（proxy 改动只新增挑战分支，31 测试全绿；simulator 132 全绿）。
- `CONTEXT.md` 新增"挑战页 / 浏览器直连通道"词条；插件侧踩坑 `pitfalls.md` 新增"全站 CF 拦截"条。
