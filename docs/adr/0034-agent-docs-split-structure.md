# AGENTS.md 分层拆分结构（索引 + 红线 / docs 细节）

现状：仓库 AGENTS.md 随「规则实时升级」文化持续膨胀——总量 94KB
（`ios/AGENTS.md` 62.7KB / 85 行、`devconsole/AGENTS.md` 18.9KB / 209 行、
`runtime/AGENTS.md` 9.5KB / 105 行）。iOS 侧虽已有 `ios/docs/` 12 文档索引表，
但「高频要点速查」63 条超长条目（播放器沉浸式/交互/清晰度、阅读页 UI/缩放/旋转/
连续章节流等）全文仍堆在主文件，每次会话无条件载入；部分条目内容与 docs 既有
文档重复（搜索页/筛选行/页面会话/JS 序列化坑等已在 docs 中，主文件是副本）。
devconsole 无 docs 目录，9 个主题节全部内联。

## 决策（2026-10 拆分）

1. **三层文档结构**：主文件（AGENTS.md）= 定位 + 文档索引表 + 每条速查压成
   1 行红线摘要；细节全文下沉 `*/docs/` 主题文档；决策记录留在 `docs/adr/`。
   主文件瘦身目标 ≤10KB，红线摘要语义保真（保留代码符号/钩子名/防护句），
   全文零改写平移（脚本按行号提取原文）。
2. **拆分流向**（正文零改写）：
   - `ios/docs/player.md`（新）：episodes 沉浸式 / ADR-0028 交互 / ADR-0029 清晰度 /
     播放面门槛（ADR-0027）。
   - `ios/docs/reading.md`（新）：阅读页 UI 架构 / ADR-0031 缩放 / 图片旋转 /
     ADR-0032 连续章节流 / 相邻章兜底 / 预加载 / 宽度修复 / 重算边界 / bottomBar 约束。
   - `ios/docs/session-and-navigation.md` 吸收：ADR-0030 listings-first / ADR-0021
     筛选行×2 / 共享 key / 导航树 / 搜索历史（2026-10 独有段）/ 探索流 Safe Area /
     页签分页器。
   - `ios/docs/architecture.md` 吸收：link 块跳转语义。
   - `ios/docs/known-limitations.md` 吸收：Slider range 崩溃 / iOS 26 toolbar 坑。
   - `ios/docs/device-debugging.md` 吸收：bar 玻璃材质判定。
   - **内容已在 docs 的条目不平移**（深链/禁自动播放/JS 序列化坑/页面会话/搜索页/
     筛选行遮挡/切插件/真机验证/封面收敛/AX 禁令），主文件只留红线摘要去重。
   - `devconsole`：新建 `devconsole/docs/{preview-navigation,video-playback,interaction}.md`
     三文档，AGENTS.md 相应瘦身。
3. **回归通道**：AGENTS.md 只加一行摘要 + 同步索引表；跨文件引用更新为新文档
   锚点。新踩坑按「插件侧 vs 宿主侧」判定后写入对应主题文档（沿用
   `docs/agents/plugin-host-boundary.md`）。
4. **明确不做**：runtime/AGENTS.md（9.5KB，结构清晰）与根 AGENTS.md（3.2KB）
   不拆；CONTEXT.md（47KB，glossary）另议；ADR 历史引用不改（历史记录原样保留）。

## 验证

- `ios/AGENTS.md` 62.7KB → 6.5KB；速查条目按行号搬移，超长行（行 27 原文 4370
  字符）完整迁入，无截断（脚本断言条目数 + 字符数）。
- 索引表 12 → 14 文档，README/根 AGENTS.md 指向 `ios/AGENTS.md` 的链接保持有效。
- 分两次提交（ios / devconsole），模块级回滚点。