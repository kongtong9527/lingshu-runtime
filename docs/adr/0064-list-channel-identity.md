# 列表通道标识 channel（插件显式声明 + 宿主原样透传，勿回退 URL 反推）

列表的「通道」身份由**插件显式声明**，宿主只做原样透传，不再从 URL 反推（2026 定）：`Listing.channel` / `PageJumpTarget.list.channel` → `AppRoute.list.channel` → `PageableListModel.Kind` → `RunEngine.execute(channel:)` → `PluginContext.channel`。缺省不传时宿主回退到既有的 URL 正则反推路径（旧插件零改动）；`Codable` 容差解码，旧串无该键即 `nil`。

原因：URL 反推在多站点与站群插件下不可靠——同一 URL 形态可承载不同语义通道（kvs_site_a「相关推荐」跳转即是一例），宿主要么误判、要么被迫维护「站点 → 通道」的知识表，而站点知识本该属于插件侧。显式声明把语义决定权交回插件，宿主保持站点无关。

> 补录说明：本 ADR 原文件缺失（编号 `0064` 在 `ios/AGENTS.md`、`ios/docs/session-and-navigation.md`、`devconsole/docs/preview-navigation.md` 三处被引用但仓库无文件）。2026-10 Phase 0 按上述三处的红线摘要补录，内容与既有实现一致；若与实现有出入，以代码为准并回改本文。

**Status**: accepted

## Considered Options

- **继续 URL 正则反推（宿主侧唯一来源）**：零插件改动，但站群/同形 URL 必然误判，且迫使宿主积累站点知识（违背「站点知识在插件侧」的既有边界）。否决。
- **宿主维护「站点 → 通道」映射表**：把站点知识写进宿主，新增站点要改宿主发版。否决。
- **`channel` 设为必填**：语义最干净，但破坏全部存量插件，需要兼容期与迁移工具。否决（改为可选 + 缺省回退）。

## Consequences

- 插件侧新增可选字段 `channel`：卡片 DSL / 数据模型侧需按根 `AGENTS.md` 的契约同步纪律登记（Phase 1 之后由契约门禁机器校验）。
- 宿主侧 `AppRoute.list` / `PageJumpTarget.list` 必须容差解码，缺省不传即走旧路径。
- 新增列表通道时：插件声明 + 宿主透传即可，**不得**为此在宿主里加 URL 特判。
