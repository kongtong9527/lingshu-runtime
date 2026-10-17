# fetchList/search 返回 ListResult，分页元数据用判别联合（page + cursor）

## 背景

插件列表契约原为 `fetchList(context?): Promise<ListItem[]>`，插件无法告知宿主「是否还有下一页」；宿主只能靠外部传入 `page` 盲翻，且无法支持游标分页源（需要把上一页返回的不透明令牌回传给插件）。

## 决策

将 `fetchList` / `search` 的返回升级为 `Promise<ListResult>`，其中 `ListResult = { items: ListItem[]; pagination?: PaginationMeta }`。`PaginationMeta` 为判别联合：

- 页码式 `{ strategy:'page', hasMore, page, pageSize?, total?, totalPages? }`
- 游标式 `{ strategy:'cursor', hasMore, nextCursor, total? }`

`PluginContext` 新增 `cursor?: string`，用于游标往返——宿主取上一次结果的 `nextCursor`，经 `PluginContext.cursor` 回传给插件。采用**硬断裂**：不保留裸 `ListItem[]` 形态，`fetchList` 与 `search` 同步迁移。

契约不变式：cursor 策略 `hasMore:true` 时 `nextCursor` 必填；`items.length===0` 时 `hasMore` 必为 false（避免无限追加）。

## 考虑过的方案（已否决）

- **向后兼容重载（`Promise<ListItem[] | ListResult>`）**：会形成两种返回形态长期并存，违背跨运行时（Node 模拟器 ≡ Swift JavaScriptCore）一致性目标，并让宿主消费逻辑分叉。否决。
- **扁平可选字段集（`{ hasMore, page?, nextCursor?, ... }`）**：游标往返要求宿主无歧义地知道下一步传 `page+1` 还是回传 `cursor`；靠字段存在性猜测在跨运行时下脆弱。判别联合的 `strategy` 标签消除歧义。否决。
- **仅 `fetchList` 迁移、`search` 保留 `ListItem[]`**：重新引入双形态并存，与硬断裂初衷矛盾。否决。

## 后果

- 一次性迁移成本：7 个插件改 `{ items }` 信封（其中 manga_site_a/manga_site_f/short_site_a 补真实 page 策略元数据以演示「加载更多」）；CLI（`runCommand` 的 `JSON.stringify`）、DevConsole BFF/前端（`runPlugin` 信封、`ListPreview` 读 `data.items`）、simulator 70 项测试与 devconsole 测试同步更新。
- DevConsole fixture 模式下，单一 fixture 对所有「加载更多」请求返回同一快照，分页器会追加重复条目。这是本地开发工具的已知限制，不特殊处理。
- `pagination` 为可选：无分页概念的源（如 zhihu-daily 当日固定列表）只返回 `{ items }`，宿主不显示翻页 UI——避免伪造分页信息。
