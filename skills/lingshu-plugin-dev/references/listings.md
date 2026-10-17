# 预设目录页 listings（分析与筛选准则）

> 归属：`lingshu-plugin-dev` 阶段 1 listings 分析全文。SKILL.md 只留红线；契约见 `data-model.md` Listing 节。

### 预设目录页（listings）分析

站点的固定分类/榜单页（manga_site_b 的「分類」、manga_site_f 的 `/classify`）经可选导出
`getListings()` 承接为源主页页签（ADR-0015），**不是筛选状态**：每个目录页
返回 `{ name, category }`，宿主把 `category` 原样传给 `fetchList` 就地渲染。
自 ADR-0021 起，listing 可携带**本目录页专属筛选组** `filters?: CategoryGroup[]`
（与 `getCategories` 的组同型同编码），宿主在浏览该目录页时渲染筛选控件，
启用项并入 `category` 后调 `fetchList`；**不持久化**（区别于搜索页按源持久化）。
自 ADR-0025 起，listing 可带 `url`（页面通道）与 `children`（导航树）。
**探索页条目（listings-first）**：`kind:'explore'` 的 listing 是**探索页**而非列表页——
内容 = `getExplore(context)` 的聚合 feed；**可配置多个**（多 `url` 多探索页，url 透传为
`getExplore(context).url`，插件按 context 分支），不消费 `category`/`filters`。

**标签索引条目（ADR-0037 + ADR-0038）**：`kind:'tags'` 的 listing 是**标签索引页**而非列表页——
内容 = `getTags(context?)` 的标签云（首字分组全量云 = 裸 `TagGroup[]`；分页排序云 = `{groups, pagination}`
信封，`sort` 服务端排序 + `page` 分页）；`url` 为索引页 URL（仅展示/回退），
验证走 `getTags` 首页（空索引判失败），不调 `fetchList`、不消费 `filters`。

1. **先实测**：`getListings` 声明的每个 category 都必须经 `fetchList` 跑通。
   验证设施 = `node runtime/dist/index.js listings <id> --dir lingshu-plugins`
   （自动逐条跑 fetchList，并对声明了 filters 的目录页打印筛选组摘要、用
   「category + 每组首选项」组合验证 fetchList 能消费；**`kind:'explore'` 的
   叶子改调 `getExplore` 验证分区产出**（带 url 时透传为探索页标识）；站点反爬
   拦截导致的筛选验证失败只提示不判失败）。
2. **目录页筛选 = 目录页的属性，不是全局搜索筛选**：同一源不同目录页的筛选
   集通常不同（movie_site_c 五分类 tid 各有一套题材/地区/年份选项、综艺无地区/语言
   组）——把各目录页独有的组放进 `Listing.filters`；只有 search 真正消费的组
   才留在 `getCategories`（见下条）。
3. **getCategories 只保留 search 真正消费的组**：筛选表单每组必须有实效
   （应用后经 `search(query, {category})` 生效）。目录型内容迁到
   `getListings()`，不要把 `fetchList` 才消费的组留在筛选表单。
4. **无 search 但有 getCategories → 应提供 getListings**：没有搜索能力的源
   不展示筛选表单，分类内容只能经 listings 目录页触达。
5. **filters 选项必须真实存在（不冒充能力）**：从 `/type/<tid>.html` 等目录页
   内嵌筛选块逐链接提取选项（id 取 `/show/` 段位值原文）。站点筛选路由被反爬
   拦截（如 movie_site_c `/show/` 前缀全系 Cloudflare 403）时，**声明真实选项、请求
   如实报错**——`fetchList` 对筛选键构造站点路由，403/挑战页时带站点信息与
   替代路径抛错，不静默回退到未筛选列表（无声假能力）。
6. **反爬站点只落指引、不冒充能力**：如 manga_site_f `/classify` 实测在
   `www.manga_site_f.com` 与 `cn.bzmgcn.com` 间无限 302 循环（沙箱 fetch failed，
   2026-08-03 复核仍复现），无法作为目录页数据源——按「只落指引」处理，
   不要声明不存在的 getListings。
7. **目录页 A-Z / 首字母筛选（video_site_a 案例）**：合集/人物/品牌/排行目录页常有
   A-Z 字母条。首字母条是**按钮而非链接**，点它发**服务端请求**
   `?fmt=json&initial=A&page=1`（XHR，响应 `{"code":0,"data":{"html":"<ul class='ms-grid'>…与 SSR 同构的卡片段…","count":N,"page":P,"initial":"X"}}`）
   ——**不要**在插件里做客户端拼音过滤（中文名标题需拼音首字母，沙箱无拼音库、
   纯前端隐藏还会冒充服务端能力）。正确姿势：
   - `Listing.filters`（ADR-0021）声明 `{ name:'首字母', key:'initial', type:'select',
     items:[{id:'',name:'全部'}, A…Z] }`（`id:''` 表「全部」，宿主对空 id 不输出参数）。
   - `fetchList` 解析 category 组合串的 `initial`，命中时改请求
     `?fmt=json&initial=<字母>&page=N`（带 `X-Requested-With: XMLHttpRequest` +
     页面 Referer），`JSON.parse` 后 cheerio.load(`data.html`) 复用**同一套卡解析**
     （video_site_a 的 `.ms-card` 解析函数 SSR 与 fmt=json 片段通用）。无 initial 走 SSR。
   - 目录页无分页器时 `hasMore:false`（整页即全部），避免「加载更多」无限可点。
   - 「不冒充」判定：服务端某字母下确无条目就返回空（如 people 无 E 开头），不要
     回退到全部列表。
8. **共享同一参数的多个筛选组（manga_site_a 分类栏 6 组）与分节单组（anime_site_a 内容标签 7 节）**：分类页/筛选面板的多个组
   可能**共享同一个 URL 参数**：manga_site_a「角色/职业、服装/样貌、倾向、剧情、重口、作品属性」6 组
   共享 `tagIds` 且**跨组单选互斥**（实测选新标签替换 URL 里的旧 tagIds、不逗号合并）——声明为 6 个
   独立 `select` 组、**key 全为 `tagIds`**（忠于站点分组 UI + 单选能力）。站点筛选 UI 是**单个面板内
   多个分区**（anime_site_a「内容标签」modal 内「影片属性/人物关系/角色设定/外貌身材/情境场所/
   故事剧情/性交体位」7 个 h5 分区、同 key `tags[]` 且**跨区多选并集**）时，不用 7 个独立组
   （宿主会渲染 7 个选择器，与单面板结构不符）——声明为**单组 7 节**（`sections`，节标题纯展示，
   宿主渲染一个「内容标签」选择器、节内分组展示）。宿主 `categoryString` 按 key 存状态
   （`select` 单值 / `check` 包含数组），同一 key 只输出一次：`select` 取最后非空值（后者覆盖，与站点
   互斥语义一致），`check` 各组/各节分片相同、去重后为单组并集编码。插件侧配套：`select` 同名重复 key
   `parseQueryString` 须**后者覆盖**而非抛错（ADR-0014 同名后者覆盖契约），`check` 须把逗号并集
   逐项拆分再按站点参数形态重发（PHP 数组参数逐项输出）；不冒充多选（站点允许多标签则用 check）。
   宿主渲染身份必须用组下标（勿 `key={g.key}` / `id == key`，同 key 会撞身份串组），分节组内按节下标 +
   叶子 id（勿只用叶子 id），编码与计数按 key 去重。
9. **落地列表页筛选（manga_site_a 每日更新星期）**：筛选若只在「点「更多」进入的落地页」才出现
   （manga_site_a 首页每日更新分区 → `/comics/ranks/daily`，星期切换在该页才有），它是**落地页
   属性**：`getExplore` 的 `ExploreSection.viewMore` 用 `{ action:'list', url, filters:[星期组] }`，
   宿主在落地 ListPreview/ListView 渲染筛选栏（`PageJumpTarget.list.filters` 可选字段，
   ADR-0026 宿主升级）。不要塞进首页分区内联。每日更新「今日/周一…周六」是**服务端
   能力**（点星期发 `GET /api/comic/daily?date=YYYY-MM-DD`，date=本周对应日期）——用稳定
   token（`today/sun…sat`）作 items id，`fetchList` 用 `$lib.dayjs` 换算出本周日期再请求，
   不写死日期（每周漂移）。
10. **H动画「默认=热门推荐」≠ 全量 API**：`/anime`（无参）与 `/anime/?channel=0` 等价
    （热门推荐= `custom?id=0`），但 `/api/video`（默认全量）内容不同。频道 tab 默认
    category 应写 `resource=anime&animeChannel=0`（热门推荐），用户选频道后合并覆盖
    （后者覆盖同名 key）。实测 `/api/video?channel=N` **不生效**——动画频道筛选必须走
    `/api/video/custom?id=N` 或 SSR `/anime/?channel=N`。
11. **首页分区 SSR 解析**：站点首页 SSR 常把分区标题（h3）与卡片（`a.comic.group`）放同
    section 容器，但**含「更多」链接的分区（如每日更新）可能是懒加载块（SSR 只有标题 +
    更多链接、无卡片）**——解析时按「标题 + 卡片」或「`.daily` 块」识别分区；懒加载分区
    的 items 由 `getExplore` 另调对应 API（如今日 `/api/comic/daily`）补全。SSR 常双份渲染
    （section + section-custom），需按「标题|更多url」去重。
12. **单分区首页不设 explore（video_site_e 案例）**：`kind:'explore'` + `getExplore`
    是为**多分区聚合**准备的——首页只有一个分区时，explore 只会原样复刻一个列表，
    反而丢掉翻页（`getExplore` 不消费 `page`）。此时首页 listings 项做**普通列表**
    （`fetchList` 拉首页，第 1 页 URL 即首页；翻页若站内即指向某频道页，如
    `/` 的分页链接指向 `/latest-updates/N/`，则翻页并入该频道）。多分区才用 explore。
    **「多分区」不限于多个接口/多个页——同一页并排的多个区块也算**（kvs_site_a 社区页案例，2026-10）：
    `/members/` 一页里并排着成员榜 + 新私密视频 + 新私密图集 → 该目录页走 `kind:'explore'`
    （三分区），**三个分区各自都有 `viewMore`**（成员榜 → `/members/` 列表页 + 排序 `filters`；
    两个私密分区 → 各自的块列表页通道 `private=videos|albums` + 各自排序档）。
    ⚠ **别把「锚的 `href` 不是地址」当成「没有列表页」**：块翻页锚是 `data-action="ajax"` 的伪链接，
    但 `get_block` 块片段接口就是它的列表页——判据是 `li.next > a[data-container-id="<blockId>_pagination"]`
    在不在（末页退化成 `<span>`）；**漏判 = 把站点能力丢掉**（kvs_site_a v1.8.0 曾因此不给 `viewMore`，
    v1.9.0 补齐，详见 pitfalls.md）。条目是 `url` 为探索页标识、真实页面写 `origin` 的老规矩（规则 14/15）；
    页内纯文字/无封面/落点重复的区块（如侧栏「最新评论」：只有评论文本、落点是被评论的视频）**不收**
    ——收了会把评论原文当标题。
    **页签形态读站点自报的类型字段，别按「接口有没有数据」猜**（video_site_h Vlog 案例，2026-10）：
    该站顶部导航由服务端 `/system/info` 下发（`movie_nav[].style`），`video_1` = 分区聚合页
    （`/movie/navBlock` 返回多分区 → explore）、`video_3` = 普通列表页
    （`navBlock` **只回广告位**、排序档在 `/movie/navFilter.filters` → 普通目录页 + `Listing.filters`）。
    一开始把 7 个页签一律做成 explore，其中一个页签静默 0 分区（`runtime listings` 打 `-> 0 个分区`，
    但**不置 exitCode**、扫一眼容易放过）——**先读配置字段分流，再按形态选 explore/list**；
    反例口径：`navBlock` 只剩 `id<0` 的运营位（广告 banner/小方块）就是「这不是分区页」。
    **页签的列表参数同理——读站点自报，别猜参数名**（video_site_h社区页案例，2026-10）：
    `/post/navFilter {id}.filters` 才是每个页签的整份列表参数（官方 `home_id`、约会 `home_ids`、
    尤物/反差 `tag_id`，都是会腐的运营数据），客户端只把它原样喂给 `/search/post`。
    曾把页签对象（`id`/`name`/`code`/`style`/`group`）挨个当 `/search/post` 参数试，
    全被忽略（与乱码值指纹逐字相同）→ 误判成「站点的子页签不支持筛选」而砍掉 4 个页签。
    **判据是「有没有一个 navFilter/navBlock 类接口在下发参数」，不是「我试的键生不生效」**；
    同一族接口（`/movie/navFilter`、`/movie/blockDetail`、`/post/navFilter`）都在下发
    「页签/合集/子类的整份参数」，见到 `filters` 字段就该想到现取现用 + 兜底（取不到时回退
    **站点首页签**那一档，别硬编拷贝兄弟页签的值）。
    另：页签自己的 `style`（如 `post_2`）是**布局形态**，不是任何参数的值——`position=post_2` 实测 0 条。
    **聚合页的分区是异构的：条目映射器按分区自报的类型分派**（video_site_h原创页案例，2026-10）：
    `/movie/navBlock {id:4}` 的 6 个分区里，「video_site_h女郎」块（`style:'20'`）条目是**创作者**
    （`type:'user'`）、其余块是视频——对所有分区用同一个视频映射器会把创作者**逐条判空**，
    随后 `if (!items.length) return` 把**整块**静默丢掉（CLI 只少打一个分区号、不置 exitCode）。
    站点自己的分派就是判据：`style==='20'` 的块「更多」也走专属通道（`/profile/upSearch {filter}`）
    而非通用 blockDetail。排查时逐块打 `style/route/items.length/首条字段集`，
    **别只看分区总数**（详见 pitfalls.md）。
13. **children 表达「层级导航 / 异构落页」，同级平铺项优先用筛选组收敛（ADR-0025 + ADR-0067）**：
    站点把入口按「组 → 子项」两层（或更深）组织、各组落页形态还不同时，用 `children` 声明这棵
    导航树；**同一目录页下的平级维度（地区/年份/排序…）优先声明成 `Listing.filters` 筛选组**
    （ADR-0021），不要为每个取值造一个子结点。**无封面但条目量大、有自然分组键的纯文字索引仍
    优先 `kind:'tags'` 标签云**（video_site_j `/model` 案例：987 模特无封面、flight 自带 `country`，
    按日本/中国/韩国/其他/待确认分组，`getTags` 返回 `TagGroup[]`，每项 `target` 进作品列表）。
    - **children 的叶子在宿主上就地渲染内容**：iOS 发现页把导航树按 DFS 展平成一条叶子页序列、
      渲染成**分级页签**（每层一条页签行 + 单一分页器，ADR-0067），叶子照常渲染列表/探索页/
      标签索引页——**别再以「宿主只渲染可折叠文字树、封面会被丢掉」为由劝退 children**（该前提
      在 iOS 上已不成立）。「索引页条目本身是可下钻的落页」也不再是非得建递归列表的理由：
      **层级导航 → children，同页平级维度 → filters**。（DevConsole 预览与 `runtime listings`
      仍按折叠树展示与逐条校验，那是调试台刻意保留的声明全貌，不是 iOS 形态。）
    - **页签行长度 = 单层子项数**：一级与二级（及更深）都渲染成页签行，**单层子项数过多会让页签行
      很长**（现网最大 fleet_site_b 每组 17 项）——同级项多时优先用筛选组收敛；确实是站点真实入口
      才留 children（别为「页签别太长」丢掉入口）。
    - **组内可以混 `kind`**：一个组的子项不必都是 `kind:'list'`——fleet_site_b 每组第一个孩子是
      `kind:'explore'` 的「发现」页，video_site_h-vlog「首页」组同理，宿主按各自 kind 就地渲染。
    - **分组结点自身不是内容页**：分组结点（只有 children）**不要写 `url`/`category`/`filters`**
      （宿主忽略，写了不生效）；只有叶子是可点击目录页（`url`/`category` + 可选 `filters`）。
    - **`children` 是声明式静态结构**：它只描述有哪些页、怎么分层；**页内翻页/排序仍要在叶子目录页
      自己的 `filters` 上表达**（children 里无处声明翻页）。
      **索引页自身还要翻页/排序时**（kvs_site_a 成员榜 `/members/` 案例，2026-10）仍走**递归列表**：
      `fetchList` 把索引卡片解析为 `ListItem`（`coverUrl` 取卡片封面，`target:{action:'list',url}`
      指向落页），点进又是列表（ADR-0025 递归列表，层级任意深）——索引页自身的翻页不进 children。
      该案例落点是会员作品页（**能承接下钻的页面通道**），该列表页同时是「社区」探索页里成员榜
      分区的 `viewMore` 落地页（规则 12）；封面有则给真图、**无则填站点自己的占位图**，
      见 pitfalls.md「封面缺失别留空」。
14. **能给出真实页面地址的目录页必须写 `url`（2026-10，宿主「网站原页」消费 `Listing.url`）**：
    iOS 发现页页签右上角的 `globe` 按钮取该页签的 `Listing.url` 在应用内打开源站真页。
    只给 `category` 的目录页**没有**这颗按钮（`category` 是 `fetchList` 的内部查询串，
    宿主不拼、也不回退首页）——站点目录页本身是真实路由时（`/latest`、`/tags/`、
    `/rank/weekly`），把它写进 `url`，`fetchList` 按 URL 形态分派即可（`runtime listings`
    会照常逐条验证）。反面案例：`kind:'explore'` 条目的 `url` 是探索页标识
    （`getExplore(context).url` 的分支键，如 video_site_a「gossip头条」`url:'news'`），**不是地址**，
    宿主任何地方都不拿它开网页（曾拼出 `/news` = 404）——别指望它兼任原页。
15. **`url` 不是地址、或只有 `category` 时，用显式 `origin` 补原页地址（2026-10，Q13）**：
    `origin` 是**展示专用**的网站原页地址（只喂宿主那颗 `globe`，**不进抓取**——抓取仍走
    `url`/`category`），宿主取值时 **`origin` 恒优先于 `url`**：
    - `kind:'explore'` 的单分区探索页：`url` 已被探索页标识占用，真实页面写 `origin`
      （video_site_a「gossip头条」= `{ kind:'explore', url:'news', origin: `${BASE_URL}/黑料gossip/推荐` }`，
      实测 200）；
    - 只给 `category` 的目录页：站点目录页是真实路由时**仍优先直接写 `url`**（`fetchList`
      也吃它、少一次分派），只有 `url` 语义被占用或想与页面通道分开时才用 `origin`；
    - **整份 listings 要逐条给全地址（video_site_f 案例，2026-10）**：video_site_f 的 21 条叶子
      （13 条 + 片商 8 子项）原先只写 `category`／`kind:'explore'`，宿主 14 个页签
      **一颗 `globe` 都没有**、push 进去的列表页也没有——「没地址就没按钮」是**静默**的，
      插件侧不写就永远不亮（宿主日志无错、CLI 逐条 `✓`，一片正常）。补法：标签/榜单型
      `url: buildTagsUrl(id, 1, 'date')`（复用插件自己的 builder，`parsePageChannel` 直接吃）、
      探索条目 `origin: `${BASE_URL}/``——**页签内容就是站点首页时，`origin` 写首页地址是合法的**，
      与「非空 listings 回退 `sourceUrl`」（Q11 废止）是两回事：一个是插件明写的当前页地址，
      一个是宿主替插件猜。**一处补、两处亮**：发现页页签与 push 的列表页走**同一条取法**
      （`listingOriginAddress`），补 `url`/`origin` 同时点亮相边。
      验证：`runtime listings <id>` 逐条打印 `[原页=…]`／`·无原页`，末尾给
      「网站原页（globe）：N/M 个叶子目录页有地址」并列出缺地址的叶子名（只提示、不置
      exitCode——纯接口源本就无网页，如 manga_site_b 的「全部」）。
    - **写进 `url`/`origin` 的地址必须实测**：SPA 的内部路由**枚举名不是地址**
      （video_site_h底部导航枚举是 `home|vlog|dark|community|mine`，真实 hash 路由却是
      `#/home|#/vlog|#/dark|#/post`——第 4 项枚举名 `community` 对应的路由是 **`#/post`**，
      `#/community` 实测**一个请求都不发**（死路由，页面空白且不报错）；第 3 项 `dark` 与路由同名，
      但它就是「尤物圈」、不是别处的页）。
      **同一个坑还有「分组归属」那一半**：按名字猜「这组页签属于哪个页面」会整组装错
      （video_site_h的 `dark_nav` 曾被当成「首页顶部栏 ☰ 的更多频道」，实际渲染在底部导航「尤物圈」页上）。
      验法三条，缺一不可：
      ① 静态定位**页面注册表**（dart2js 产物里 `A.bZ(new A.cvX(),"中文标签",…,"/path",…)` 直接给出
      「标签 → 路由」真值）与**页面类读的配置字段**（哪个页面读 `movie_nav`/`dark_nav`/`post_nav`…）；
      ② 浏览器**在已加载的应用里改 `location.hash` 逐跳**，按时间戳把「页 → 接口」一一对齐
      （`#/post`→`/post/navFilter`、`#/dark`→`/movie/navBlock`、`#/dating`→`/search/dating`、
      `#/community`→**无请求**）——**别用整页重载导航到 hash 地址做这件事**：启动路由可能把你送回
      首页，页面上若还有人在操作更不可靠；
      ③ 内容侧交叉验证（接口返回的分区名/标题会自带站点自己的叫法，video_site_h `navBlock{id:11}` 首分区
      就叫「尤物圈 - video_site_h独家冠名制作」）。
      地址写错不是 404、页面**照常渲染**，只是内容不是那一页——比 404 更难发现。
      **且只有无参路由是地址**（video_site_h 2026-10 逐条实测）：app 内部的
      `A.b6("<path>", {…params})` 是 **push 路由对象，参数不进 URL**——`#/home/movie/detailH?id=`、
      `#/home/movie/tagDetail?id=`、`#/home/movie/blockDetail?id=`、`#/profile?homeId=` 四个
      「站点自己的路由」实测**全都没有对应页面**（前两类无请求，后两类只发首页 `/movie/navBlock`
      = 回退首页）。**带参的内部路由不能当落地地址**，参数化列表页一律用自造稳定标识
      （见规则 18；站点对任意路径都回 SPA 外壳，`curl /tag/72` = 200 与首页同字节，不会 404）。
    - 未声明一律不显示按钮（**不回退首页**）：`origin` 留空 = 没写（回落 `url`），
      写了却拼不出合法 http(s) 则该条目不挂按钮（非空 `origin` 即权威，不静默改指 `url`）。
    宿主侧判据单点收敛在 `WebsiteOrigin.listingOriginAddress` / `listingOriginURL`；
    导航树叶子（无论页签就地承载还是 push 的独立页，如标签索引/探索页）也带同一颗 `globe`。

16. **索引页的页级筛选照站点渲染的控件声明（kvs_site_a 案例，2026-10）**：分类/模特/标签这类
    **封面索引页**常自带「类型开关」（站点右上角 `Videos | Albums`）与「A-Z 字母条」，它们
    与列表页的排序同为**页级筛选**，一律进该 listing 的 `filters`（ADR-0021）。要点：
    - **先判形态再落通道**：类型开关在站点上通常是**换页**（`/categories/` ↔ `/albums/categories/`、
      `/models/` ↔ `/albums/models/`、`/tags/` ↔ `/albums/tags/`），**不是查询参数**——做成一个
      `key:'type'` 的 `select` 组，插件在 `fetchList`/`getTags` 里按值换抓目标页；该 key 是
      **插件内部键**，必须在 URL 构造处拦下（转发白名单），漏拦 = 把 `type=album` 拼进站点 URL，
      站点忽略它、**静默返回未筛选结果**（不报错、看着一切正常）。
    - **A-Z 是服务端筛选不是客户端过滤**（规则 7 同族）：锚上 `data-parameters="section:A"`
      实测直访 `?section=A` 生效、且与 path 分页并存（`/models/2/?section=A`）；站点末项
      `section:`（`All`，空值）→ 用空 id 表「全部」（宿主对空 id 不输出参数）。**别在插件里
      做首字母过滤**（中文名要拼音，且那是冒充服务端能力）。
    - **同前缀不同形要判在前**：图集侧索引页（`/albums/categories/`、`/albums/models/`、
      `/albums/tags/`）与图集列表页（`/albums/categories/<slug>/` 等）**同前缀不同形**，
      还与图集详情（`/albums/<id>/<slug>/`）三态并存——路径判定必须「锚在 `/?$` 的索引」
      优先于「`/albums` 通配」，判错会被当图集列表用 `.list-albums` 解析，**静默 0 条**。
      两侧索引页 DOM 同形（`.list-categories|.list-models a.item` + `strong.title`），只有计数
      类名不同（视频侧 `.videos`、图集侧 `.albums`）→ 共用同一套卡片解析，别抄两份。
    - **日期选择器 = 页级筛选，走 `type:'text'`（video_site_h「每日精选」案例，2026-10）**：站内页首
      摆着日历（选某天看当天的片单）时，把它声明成 `{name:'日期', key:'label', type:'text',
      placeholder:'YYYY-MM-DD'}`，`fetchList` 缺省取**站点会用的那个值**（当天）——**别不声明**
      （用户永远只能看今天，等于把站点的日期能力吞掉），也别做成 `select` 硬编几档（日期是连续的；
      `text` 无选项、`runtime listings` 打印 `0项` 且不探针、不判失败）。
      ⚠ 这类日期档常常是端点的**必需参数**、缺参报的还是「网络异常」这类与真实原因无关的文案
      （详见 pitfalls.md），所以缺省值必须有、且格式校验前置（不符合格式就抛清晰错误）。
    - **`kind:'tags'` 叶子同样消费 `filters`**（ADR-0062）：标签索引页自己的页级筛选声明在
      tags listing 上，组合串经 `TagContext.category` 回 `getTags`——与 `fetchList` 的
      `context.category` 同口径。服务端排序也是普通筛选组（`TagContext.sort` 已退役）。
    - **两侧档位不同时走筛选组联动（ADR-0063）**：kvs_site_a `/albums/categories/` 站点自己渲染了排序条
      （Alphabetically / Top Rated / Most Albums），但视频侧没有该控件，且两侧「Top Rated / Most」
      的站点参数值不同（`avg_videos_rating` vs `avg_albums_rating`、`total_videos` vs `total_albums`）
      ——排序组写 `dependsOn:'type'` + `optionsWhen:{video,album}`（`items` 放缺省页侧），
      切类型即换档位 + 清空已选。`fetchList` 的跨侧映射保留作旧宿主/旧串的双向容错
      （新宿主发不出错配），中性命名避免串味。联动 emergence 前的老出路
      （宁可不声明 / 单静态组 + 映射）已退役，不要再抄。
    - 验证：`runtime listings <id>` 对每组**前 2 个非空 id 选项**跑组合验证（首项往往就是
      listing 自己那页，只验首项会漏掉真正换页的那一支）；`kind:'tags'` 叶子走 `getTags` 验证。

17. **多形态站给每个叶子写 `channel`（ADR-0064，替代 URL 正则分流）**：视频/图集双栈、
    索引/列表同前缀不同形的站，不要让 `fetchList` 靠十几个正则反推「进哪个分支」——
    在 `getListings()` 每个叶子写 `channel`（取值自定，建议复用 `classifyPath` 的 kind，
    如 `'video-list'` / `'album-list'` / `'category-index'`），`target: { action:'list' }`
    同样带 `channel`；宿主透传进 `context.channel`，插件 `resolveChannel` 优先按它
    `switch`、无才回退单点 URL 正则（旧宿主 / 裸 `--url`）。`url` 照写（抓取 + 原页），
    不因有了 channel 而省略；`runtime listings` 逐条打印 `[channel=…]` 并带 channel 验证。

18. **详情页实体（分类/主演/标签）跳转的落地列表页（video_site_h案例，2026-10）**：详情页里的
    「分类」「主演」「标签」常被写成**一行死字**或只有名字的芯片——它们是站点**真实的筛选维度**，
    应当是可点的列表入口（`tags` 芯片 / `tagGroups` 分组芯片，后者一行一种类型，
    iOS `DetailView` 与 DevConsole `BlockRenderer` 都渲染成可点芯片，跳转同扁平 `tags`）。
    三条口径：
    - **先按三点对照验参数**（pitfalls「筛选参数看着像不等于生效」）：video_site_h `cat_id`（1062）/
      `home_id`（59，= 演员作品列表）/ `tag_id`（4244）/ `/search/post {tag_id}` 都是真维度，
      无效值一律回 0。**主演点进作品列表**用 `home_id`（与创作者榜条目同一个通道与标识），
      不是站点那个参数化的用户主页（该页无可用地址，见规则 15）。
    - **落地地址用自造稳定标识**（`<BASE>/tag/<id>`、`<BASE>/cat/<id>`、`<BASE>/post-tag/<id>`、
      `<BASE>/up/<id>`，与既有的 `/movie/<id>` 同约定）：带参路由不可深链（规则 15），
      而 `url` 是 `PageJumpTarget.list` 的抓取身份兼原页地址。**标识即维度**：
      `classifyUrl` 认这几种形态、`fetchList` 在 `category` 缺参时拿它兜底（老宿主/裸 `--url`
      调试只给 url 也能定维），别让标识变成不可解析的装饰。
    - **排序档走跳转携带的 `filters`，不要写进 base `category`**：宿主应用筛选是
      `mergeListingCategory(base, filterCategory)` = **纯拼接**，base 里再带一个 `order=new`
      就会拼出 `tag_id=72&order=new&order=hot`（`parseQuery` 虽然后者覆盖、不出错，
      但纯属埋雷）；缺省档交给 `fetchList` 自己兜（本插件 `if (!filter.order) order='new'`）。
      站点两处下发的档位名可能不同（video_site_h视频标签页 = 热度最高/最近上架/观看最多/收藏最多，
      典藏页 = 最近更新/热度最高/最多观看/最多收藏），插件内统一取一套，**别按页复制**。
