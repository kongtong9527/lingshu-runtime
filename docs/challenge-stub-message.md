# 浏览器桩挑战文案（runtime 宿主侧，已关闭）

`src/runtime/browser.ts` 的 `createBrowserAPI()` 在无浏览器时恒抛 `code == 'CHALLENGE'`
的指引错（ADR-0043；`--fixture` 模式由 `commands/run.ts` 覆盖为快照返回，不经过此分支）。

## 已关闭：文案统一构造（ADR-0052）

旧已知问题（桩文案写死 `anime_site_a:` 前缀，新 L3 插件在线跑透出他站前缀）已连根拔掉：
宿主抛错一律走 `src/runtime/challenge.ts` 的 `challengeError(url, status)` 统一构造
（`Lingshu:` 中性前缀 + `CHALLENGE` token + URL 全串），`browser.ts` 桩只是其调用方之一
（`$lib.http.get` 边界判定、`commands/run.ts` 浏览器边界判定同源）。

## 红线（保留）

新增宿主抛错点必须走 `challengeError` 构造器，**禁站名前缀**——前缀误导的教训见上节。
插件侧不再构造挑战错（`challengeError`/`isBlockedResponse` 为历史包袱，anime_site_a/video_site_f 已删），
路由级指引只以前缀改写 `e.message`（保留 `code`/`url`），见 movie_site_c `fetchFilteredList`。
