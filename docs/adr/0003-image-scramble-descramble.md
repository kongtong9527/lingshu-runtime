# 图片切片解扰契约(空间打乱,非密码学)

## Status

accepted

## Context

ADR-0002 把"图片切片打乱(scrambling,非密码学变换)"列为已知限制,明确"等具体源驱动再定架构"。manga_site_b(JM)正是这个驱动源。

JM 阅读页的章节图是空间打乱的:每张图按整数 `num` 横切成 `num` 条(blockSize = ⌊height/num⌋,余数挂在最后一条),再把条带**倒序重排**(还原 = 同样的切法再倒一次,自反)。`num` 每图各异,由 `MD5(chapterId + 文件名)` 派生,且按 chapterId 区间有不同公式。封面图(`onThumbnailLoad`)不打乱,只设请求头;只有阅读页章节图(`onImageLoad`)需要解扰。

两个硬约束决定了必须新增宿主能力:
- 插件沙箱只能拿**文本**(`$lib.http.get` 的 body 是 string),做不到二进制图像"解码→切片→重排→编码"。
- 宿主 `decryptImage`(`devconsole/server/src/proxy.ts`)只做字节级 AES,无任何图像库(devconsole 依赖里无 sharp/jimp/canvas)。

而 `num` 是**每图一个**的参数,现有 `metadata.imageEncryption`(每结果一份静态 key/iv)放不下 N 张图各自的 `num`;`ReadingPage.pages` 又是 `string[]`,数据模型里没有挂"每图参数"的位置。

## Decision

1. **宿主新增"通用横切倒序"图像变换**(`proxy.ts`,经 **sharp** 实现):输入一张图与整数 `num`,按 JM 的切法(blockSize=⌊h/num⌋、余数挂最后一条)切成 `num` 条、倒序重排、重组。变换**通用**:宿主不认任何站点业务,只懂"按 num 把图横切倒序"。

2. **每图 `num` 由插件算好后,骑在图片 URL 的保留 query `__s=<num>` 上**(如 `.../photos/{epId}/3.jpg?__s=10`)。代理拉取前**剥掉 `__s`**(否则上游 404)、读出 num、回源后按 num 做倒序变换。

3. **不改数据模型**:`ReadingPage.pages`(及任何需解扰的图片 URL)以带 `__s` 的字符串形式承载参数。`ReadingPagePreview` 现有 `proxyUrl(url)` 循环无需改动,只需 `proxy.ts` 识别并剥离 `__s`。

4. 保留参数命名空间 `__s` 归本机制占用,插件不得挪作他用。

## Considered Options

- **A. 扩 `metadata.imageEncryption` 加 transform 变体**:否决。`num` 每图不同,metadata 是"每结果"的,放不下 N 个 num;除非宿主自己算 num(泄漏站点逻辑)。
- **B. num 编进图片 URL 的保留 query(本决策)**:宿主保持通用、num 天然随每图 URL、不动数据模型、前端 `proxyUrl` 循环零改动。代价仅是约定一个保留参数名 + 代理剥参。
- **C. 每图元数据查表**(`metadata.imageScramble.params=[{url,num}]`):否决。O(N) 表 + URL 匹配脆弱,比 B 啰嗦,且要动数据模型。
- **D. 宿主硬编码 JM 的 num 公式**(`{algorithm:'manga_site_b-strip-reverse'}`):否决。宿主泄漏 JM 内部逻辑、不可复用。

## Consequences

- 宿主须加 **sharp** 依赖 + 在 `proxy.ts` 实现倒序变换 + 识别/剥离 `__s`。
- 契约**运行时无关**:DevConsole 用 Node+sharp 实现;未来 Swift JavaScriptCore 端用原生 API 实现同一变换(同样的"num 骑 URL"契约)。
- 目前只覆盖"横切倒序"这一种打乱;若将来遇到别的打乱方案(块状置换、噪声等),按"变换名 + num 骑 URL"的同形扩展即可(如 `__s` 的值升级为 `reverse:10` / `block:8x8`)。
- 图片请求头(JM 需 `Referer:https://localhost/`、`X-Requested-With` 等)是另一条独立需求,见转换规格"遗留项";与本解扰契约正交。
