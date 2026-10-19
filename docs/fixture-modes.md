# fixture 两形态：单文件 与 目录（多跳离线验证）

> 归属：`runtime` 宿主侧。插件侧怎么用见 `lingshu-skills/lingshu-plugin-dev/SKILL.md` 阶段 3；
> 触发本能力的需求背景见该技能 `references/pitfalls.md`「『页面即接口』站」条目。

## 为什么有两种

`--fixture <path>` 最初只有**单文件**形态：整份快照覆盖 `$lib.http.get/post` 的**每一次**调用。
单跳动作（`detail` 只抓一个页面、`list` 只打一个接口）够用，但一个逻辑动作发多次请求时就会串味：

| 场景 | 请求数 | 单文件形态的后果 |
|---|---|---|
| `play`（详情页 → 解析接口） | 2 | 详情页 HTML 被喂给 JSON 接口 → `JSON.parse` 失败，看着像「站点改版」 |
| `getExplore`（首页 → N 个分区接口） | 1+N | 全部拿到首页 HTML |
| `listings`（逐叶子跑 fetchList） | 叶子数 | 所有目录页共用一份快照，除第一个外全是假数据 |

**离线跑不通 = 只能在线回归**，而在线回归对「站点抽风」「内容 churn」无法区分，
回归信号变脏。目录形态就是把这个缺口补上。

## 用法

```bash
# 单文件（存量行为，未改动）
node runtime/dist/index.js run <id> list --fixture lingshu-plugins/_fixtures/<id>/list.json

# 目录（新）：按 URL 逐条匹配
node runtime/dist/index.js run <id> play --fixture lingshu-plugins/_fixtures/<id>
node runtime/dist/index.js listings <id> --fixture lingshu-plugins/_fixtures/<id>
```

判形态只看路径：**文件 = 单文件模式，目录 = 目录模式**（`fs.statSync().isFile()`）。
两种形态都由同一个 `--fixture` 承载，因此 `run` 与 `listings` 的所有动作（含逐叶子验证）
自动都能用，无需新参数、无需改各命令。

## `<dir>/index.json`

```json
{
  "routes": [
    { "regex": "^https://video_site_c\\.com/zh/$", "file": "home.html" },
    { "match": "player_api", "file": "player.json" },
    { "regex": "studio/room/[^/]+/video/", "file": "detail.html" },
    { "match": "*", "file": "list.json" }
  ]
}
```

- **自上而下第一条命中者生效** → 具体规则写前面、通配写后面。
- `match` 是 URL **子串**匹配（最常用，写接口名/路径片段即可）；
  `regex` 是正则（需要锚定或排除时用）。两者都无、或缺 `file` 的条目被忽略。
- `headers`（可选）是**请求头条件**：`{"X-Requested-With": "XMLHttpRequest"}` 表示
  「只有带这个头的请求才吃这份快照」。名字大小写不敏感，值 trim 后大小写不敏感**全等**。
  用于「同一个 URL 两副面孔、判别开关是请求头」的站（video_site_c：带 `X-Requested-With` 回 JSON、
  不带回 SSR HTML）——只按 URL 匹配时两副面孔只能摆一份，另一份会拿到错内容。
- `file` 相对 `<dir>` 解析。
- `match: "*"` 是**可选**兜底；**不写兜底时未命中的请求显式抛错**：

  ```
  fixture 未覆盖该请求：https://video_site_c.com/zh/api/model_block?…
    → 在 …/index.json 的 routes 里补一条匹配（现有：regex:^https://…$, match:player_api, …）
  ```

  这是刻意选的：单文件模式的隐患正是「把 A 的响应喂给 B 而静默通过」，
  目录模式宁可直接失败，也不让缺覆盖伪装成解析 bug。

## 实现落点

`commands/run.ts` 的 `loadFixtureResolver(fixturePath)`：把路径解析成
`(url, headers?) => { body, source }`，`buildSandbox` 的 fixture 分支在 `$lib.http.get/post` 与
`$lib.browser.getHtml` 三处调用它（浏览器通道同口径，保持 L3 插件离线可验），
并把 `$lib.http` 的 `opts.headers` 一路传进去供 `headers` 条件判定。
`onRequest` 记录的响应头带 `x-lingshu-fixture: <命中的文件名>`，
在 DevConsole 请求面板上能一眼看出每条请求吃的是哪份快照；
routes 列表在「未覆盖」报错里也会带 `+headers:<名>` 后缀，便于确认条件挂上了。

## 边界（勿越界）

- 目录模式**不做**「同 URL 按调用次序取不同文件」（次序型依赖无法用声明表达，
  该在插件侧确认那是真实语义）。**请求头条件（`headers`）已于 2026-10 支持**——
  「两副面孔」型站点正是它的用途。
- fixture 仍是**纯文本快照**，二进制响应（图片/字体）不在覆盖范围。
- ⚠️ **同 URL 两副面孔时勿只摆一份**：另一副面孔会静默拿到错内容，
  症状是「字段长度不对」「筛选组莫名少了一组」。两副面孔 URL 完全相同时**必须**用
  `headers` 分流；URL 不同（如带查询串的 XHR）也建议顺手写上，防日后形态变化。
- 「快照与在线不一致」类问题优先看快照是否**按插件消费面裁剪过**
  （video_site_c 的 `studio_room_*.json` 剔除了 `roomVideos/myVideos/nextVideos` 三块旁支数据）；
  裁剪过的快照不能拿来验那三块的解析。
- 本能力不改变 CLI 仍是纯 Node、L3 在线仍如实抛 `CHALLENGE`。
