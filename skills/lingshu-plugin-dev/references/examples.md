# 示例插件库（案例索引与详解）

> 归属：`SKILL.md`「参考示例」的全文。SKILL 主文件只留一行表格；本文件按 **你要做的事** 找案例，再读对应插件的实现。
>
> 公开仓 `lingshu-plugins`（`bilibili-hot` / `zhihu-daily` / `github-trending` 三个干净示例）：`git clone` 后 `lingshu list --dir <克隆目录>`。其余案例在母仓 `lingshu-plugins/`。

## 按能力找案例

| 你要做的事 | 看哪个插件 |
|---|---|
| 最小 JSON API 列表 | `bilibili-hot` |
| JSON 列表 + HTML 详情 | `zhihu-daily` |
| HTML 列表（cheerio）+ JSON 详情 | `github-trending` |
| 漫画/图集阅读页 `fetchReadingPage` | `manga_site_f` |
| 分类 + 搜索 + 阅读页 + HLS `video` 块 | `manga_site_a` |
| 响应 AES 解密 + 图片切片标记 + 目录页 | `manga_site_b` |
| OAuth 续登 + 验证码直问用户（`$lib.ui`） | `ccc` |
| 线路×剧集 + 播放页解析 `fetchPlayUrl` | `movie_site_c` |
| 页面通道 + 递归列表 + 文本阅读 + 懒播放 | `video_site_a` |
| 清晰度双通路 + AES/MD5 签名 + 导航树 | `movie_site_a` |
| 分页排序标签云 + 两跳懒播放 + episodes | `video_site_b` |
| 站群聚合（一份代码 14 个内容池） | `fleet_site_b` |
| VIP 付费墙 + passphrase 解密 + 镜像故障转移 | `fleet_site_a` |
| SPA 导航镜像 + 日期档筛选 + 详情实体跳转 | `video_site_h-vlog` |
| 声明式登录 + 写侧 `invoke` + `getMe` 状态水合 | `video_site_g`（母仓） |

## 入门建议

第一次开发先读 **`github-trending`**（单文件 100 行内、HTML 列表 + JSON 详情）；需要登录/播放/目录页时再按上表找最接近的案例，只抄对应片段，不要整体复制——每个站点的 DOM 与接口都不同。

## 案例详解

公开 `lingshu-plugins` 仓（`bilibili-hot` / `zhihu-daily` / `github-trending` 三个干净示例，`git clone` 即得）与下述母仓内实现可对照阅读。
全局安装后本地没有示例插件时，先 `git clone` 该仓再 `lingshu list --dir <克隆目录>`。
- `bilibili-hot.plugin.js` — JSON API + dayjs 时间格式化
- `zhihu-daily.plugin.js` — JSON API 列表 + HTML 详情（cheerio 解析）
- `github-trending.plugin.js` — HTML 列表（cheerio）+ JSON API 详情
- `manga_site_f.plugin.js` — HTML 列表 + HTML 详情 + `fetchReadingPage` 阅读页（漫画图片提取）
- `manga_site_a.plugin.js` — JSON API + HTML 详情 + 分类 + 搜索 + 阅读页 + HLS `video` block（`referer` 用法）+ **探索页条目**（getListings 首项「发现」`kind:'explore'`，listings-first）
- `manga_site_b.plugin.js` — 加密响应（AES-ECB）解密 + 域名线路刷新 + 图片切片 `__s` 标记 + 分类/搜索/发现页 + getListings（2026-08 收敛：原 13 平铺页签 → 1 顶层目录「全部」+ 分类/排序筛选组，2026 listings-first：首项「推荐」`kind:'explore'` 探索页条目）+ **声明式登录**（`getAccountSchema` + `login`）
- `ccc.plugin.js` — OAuth token + 刷新/续登 + **验证码登录经 `$lib.ui.showInputDialog` 直问用户**（账号密码仍走声明式 schema）
- `movie_site_c.plugin.js` — macCMS 影视站：**线路 × 剧集**（episodes block）+ **播放页解析**（`fetchPlayUrl`，NBY 线路 hex → artplayer → 解析接口 → AES 解密 → MP4 直链）+ 网盘线路剔除 + getListings（5 分类页每项内嵌真实筛选组）+ search
- `video_site_a.plugin.js` — 综合gossip站：视频/黑料新闻/小说/精选合集（moviesets 两级专题）四类内容。演示 新契约全链路：**页面通道**（`fetchList` 按 `context.url` 分派六类 SSR 列表）、**目录页筛选栏收敛**（`getListings` 顶层平铺目录、无 children：精选合集/91视频/黑料gossip/91短视频/色情小说各自内嵌筛选组，合集类型+A-Z / 视频类型多模板 / 栏目+排序 / 分类 / 分类，`fetchList` 经 `resolveCatalogURL` 按筛选 key 分发 URL）——见「children 平铺 vs 目录页筛选栏」准则、**多探索页条目**（listings-first 示范：getListings 首两条「推荐」默认探索页 + 「gossip头条」`url:'news'` 单分区探索页，`getExplore(context)` 按 context.url 分支过滤分区）、**递归列表**（合集条目 `target:{action:'list',url}` 任意深度）、**文本阅读**（小说单页全文 → `fetchDetail` 出 text blocks）、**懒播放解析**（`video` 块无 url 播放占位 + `fetchPlayUrl` 解包 packed JS → `detail_play` 接口 → m3u8）、**短剧直嵌流**（91短视频 `/melonshort/*`：m3u8 直嵌详情 `<script type="application/json">`，`fetchDetail` 直接出 `video.url`，另一条播放路由）、**路径分页**（`/melonshort/{N}`、`/melonshort/{slug}/{N}`）、图片 AES-CBC 加密（与 short_site_a 同 key/iv）
- `movie_site_a.plugin.js` — movie_site_a（zw.movie_site_a.top）双资源站。演示 ** 视频清晰度双通路**（短视频板块真实播放为 master playlist，清晰度菜单由宿主 hls.js 自动渲染、插件零声明）+ **AES-CBC 加密响应 + MD5 签名**（`sign=MD5(timestamp+guid+nonce+secret)`，任意 guid 通过）+ **导航树**（视频 5 板块顶层平铺，各带运行时拉取的标签筛选组 + 漫画目录带类型/状态筛选）+ **探索页条目**（getListings 首项「推荐」`kind:'explore'`，listings-first）+ **懒播放占位**（视频详情 `video` 无 url + `target.play`，`fetchPlayUrl` 内三源线路择优：镜像 m3u8 → Twitter master → MP4 直链，线路不暴露切换）+ 漫画章节阅读（`fetchReadingPage` 相邻章节定位 prev/next）+ 搜索仅视频（漫画无搜索接口）、`getCategories` 只保留 search 消费的板块组；**`getLabelVideoList` 的 labelId 必传**（fixture 时代曾记可选，2026-08 实测缺失报「标签ID不能为null」→ `fetchVideoList` 缺省按板块默认标签兜底，见踩坑记录）
- `video_site_b.plugin.js` — video_site_b（JavStream 同构站，SSR）：**分页排序标签云首发**（`getTags({page,sort})` 信封，`views|videos`，120/页）+ **两跳懒播放**（详情 `playEndpoint` → `video_source.php` JSON 取时效 MP4，`fetchPlayUrl` 现算现用）+ **合集 episodes**（`a.badge …&fid=…&ep=N` 单线路“视频”，1189 集实测）+ 分类子菜单各带排序筛选
- `fleet_site_b.plugin.js` — **fleet_site_b 站群聚合**（14 个内容池 / 72 个域名同一后端）。演示**一个插件覆盖多站**的完整做法（详见同目录 `website-analysis.md` §6）：站点身份**双通道解析**（`category` 的 `app=` → URL host → 默认站，无筛选走 url、有筛选走 category）、listings **顶层按站点分组**（每站「发现」探索页 `url:'site:<key>'` + 8 频道）、频道 URL **统一 `/?type=X`**（实测全家族通用，不必逐站适配路由）、**同池镜像只取一个域名**；VIP 解锁与 8 镜像故障转移同 `fleet_site_a`。验证口径：`listings` **126/126 目录页 + 126/126 原页**、**跨站端到端 14/14 站实测可播**
- `fleet_site_a.plugin.js` — fleet_site_a（fleet_site_a.com，fleet_site_b 家族；Angular + Ionic SPA + 纯 JSON API、无 SSR）。演示 **VIP 付费墙解锁**（限制只在前端 UI、服务端零鉴权 → 插件不消费门槛字段直取出流；判定法与标注形态见踩坑记录「内容类」）+ **CryptoJS passphrase 响应解密**（OpenSSL `Salted__` 格式，密钥是站点 main.js 里的字面量）+ **8 个 API 镜像顺序故障转移**（判据「业务数据可解析」而非 HTTP 200）+ **时效签名流现算**（`m3u8s` 签名约 2h 过期 → `video` 块懒播放占位、`fetchPlayUrl` 现请求详情；**不声明 `referer`**——实测该 CDN 不校验）+ **首页 8 分区 explore**（`home_<type>_8`，VIP 板块 `viewMore` 落到真实目录页 `?type=c0`）+ **8 频道目录**（VIP 频道库内嵌 22 个制片厂筛选组，key 复用站点自己的 `type` 参数、靠「同名后者覆盖」与 listing 基础串组合）+ 同作者推荐块（复用站点自己的 `searchfleet_site_bs` + `keywords=user_<上传者>`）
- `video_site_h-vlog.plugin.js` — video_site_hVlog（Flutter Web + video_site_h 加密信封 + hash 路由 SPA）。演示 **listings 直接镜像站点底部导航各页的页签**（导航配置由服务端 `/system/info` 下发：首页 7 页签 / Vlog 2 / 尤物圈 6（`dark_nav`）/ 社区 5（`post_nav`）/ 约会抽奖 5（`dating_nav`），顶层 `children` 分组承接；页签形态按站点自报的 `style` 分流——`video_1`→navBlock 分区页走 `explore`、`video_3`→普通列表页走 `filters`）+ **分组与地址按页面注册表/页面类实测**（内部枚举名 `community` 对应的路由是 `#/post`，`#/community` 是死路由；`dark_nav` 属「尤物圈」页而非首页 ☰，见踩坑记录 + listings.md 规则 15）+ **页签参数现取现用**（`/post/navFilter {id}.filters` 才是各页签的整份列表参数，穷举猜键只会全被忽略，见踩坑记录）+ **日期档页级筛选**（首页「每日精选」= `/movie/daily` 的必需参数 `label=<YYYY-MM-DD>`，缺参回「网络异常」→ `type:'text'` 声明 + 缺省当天 + 格式前置校验，见踩坑记录）+ **客户端硬编码榜单页**（`#/ranking` 4 榜签，标签→端点取自 bundle 的 switch 分支；video_site_h榜是创作者榜，条目换 `creatorItem` + 自造 `/up/<id>` 通道进其作品列表）+ **分区「更多」落合集页**（`/movie/blockDetail` 的 4 档 filter 即 `/search/movie` 整份参数，原样透传 + `ListResult.filters` 回给宿主）+ **详情页可点实体**（分类/主演/标签各自进对应列表：`cat_id`/`home_id`/`tag_id`，帖子标签另起 `post-tag` 通道；四档排序经 `target.filters` 携带、不写进 base category；落地地址是自造稳定标识——站点**带参内部路由实测全都不是地址**，见 listings.md 规则 15/18）+ **三种 id 形态**（纯数字 / 16 位 hex / 24 位 hex，`\d+` 取 id 会静默截断致详情恒报「不存在」，见踩坑记录）+ 三类内容形态（`/movie`、`/post`、`/dating` 各自 detail 通道）

## video_site_g 写侧实战（登录 + invoke 全链路）

母仓 `video_site_g.plugin.js` 是「声明式登录 + 通用写侧」的参考实现，要点：

- **`getMe()`**：登录态 + `states` 开态表水合；**无 token 直接回空 user、不发请求**（宿主判空即未登录、静默落表单）。
- **写侧方法**：插件自定 `setUserState({userId, active})` / `setPostState({url, slot, active})`；宿主按卡片声明**通用直调、不映射方法名**。
- **开关语义**：POST 开启、`$lib.http.del` 取消；终态以服务端返回为准（结果终态键缺省 `active`，可声明 `resultKey` 改）。
- **未登录两态提示**（grill-with-docs 决议）：插件 `$lib.ui.showMessage` toast、宿主 `catch` 保持静默不弹窗——没登过（无 token）请求都不发，直接 toast「请先到设置页登录」+ 抛含 `loginRequired` 的错；token 过期（服务端报未登录、文案带 `loginRequired`）在 catch 里 toast「登录已过期，请到设置页重新登录」后原错重抛。错误后缀只进日志供 grep。
- **按钮初态**：详情 `metadata.actions` 给宿主按钮组初态（未登录即缺省隐藏）；列表 `statesOf()`（一次 `getMe` 取开态表）水合 pill 初态 + 计数项初态。
- **卡片绑定**：帖子卡头像/作者名绑 `{action:'list', url: authorUrl}` 进作者列表；底部 actionBar 计数项绑 `{action:'invoke', call, effect}` 直调（宿主成功即时翻转，失败本地不动）。卡片契约见 `card-dsl.md`。
