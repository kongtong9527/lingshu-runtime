# 契约版本与包版本解耦（两条号段）

2026-10 用户拍板（代价显形后当场定案）。解耦前的状态是：`contracts/lib-api.json` 的 `runtimeVersion` **必须恒等于**
`runtime/package.json` 的 `version`（门 2 的 L4 版本腿钉的），于是**任何 runtime 包发布都会推着
契约版本走**。代价在一次真实发版里显形——`1.0.0 → 1.0.1 → 1.0.2` 连跳两次，两次**都不是契约面
变更**，只是「首次发布必须用新版本号」（trusted publisher 验证）和「CLI `--version` 写死」两件
与 `$lib` 注入面毫无关系的事（母仓的 `docs/opensource/execution-phases.md`「首次发布之后：CI 里发」
一节记了这次代价）。契约版本这个语义被磨成了「包版本的别名」：插件作者看到
`minRuntimeVersion: 1.0.2` 会以为宿主多提供了什么能力，其实只是修了个 CLI 版本号。

问题不在「谁跟谁相等」，而在**两条号段被当成了一条**：

| 号段 | 语义 | 该什么时候动 | 谁比它 |
| --- | --- | --- | --- |
| App 发行版 `0.1.x` | App 自己的发行节奏 | 任何动 `ios/` 的提交 | 用户看「我装的是哪版」 |
| **契约版本** `1.0.x` | `$lib` **注入面**的版本 | **只随注入面变更** | 插件 `minRuntimeVersion`；iOS 宿主如实声明 |
| **包版本** `1.0.x` | npm 包发到第几版 | 每次发布（补丁/文档/CLI 都算） | npm 用户；devconsole 的依赖范围 |

ADR-0009 当初把「宿主实现的契约版本 ≥ 插件声明值」定为安装门槛，**基准必须是契约版本**；
而 `runtimeVersion` 这个名字在解耦后就是一句假话（它不再等于 runtime 的包版本）。

决策：

1. **字段改名 `runtimeVersion` → `contractVersion`**：名字必须说清「这是本契约（注入面）的版本」。
   改名不是契约面变更（`$lib` 的方法/参数/返回语义一个没动）⇒ 契约版本保持 `1.0.2` 不动。
2. **门 2 的 L4 腿从「三处同值」改成两条不同强度的约束**：
   - iOS `PluginRuntimeContract.version` ↔ 契约 `contractVersion`：**恒等**（一个字的差都不能有）。
     这条是原 L4 腿真正要守的东西——宿主宣称的基准必须是它真实现的那一版。
   - `runtime/package.json` 的 `version` **≥** 契约版本：包**可以领先**（补丁不动契约面），
     **不得落后**（落后 = 包发出去了却少注入一个契约声明过的方法）。跨号段比较走 semver 三元组；
     另拒「包版本是契约版本的预发布版」（`1.0.3-rc.1` 的三元组等于 `1.0.3`，但它不是 `1.0.3`）。
3. **新增注入面指纹 `surfaceHash`**（`lib-api.json` 顶层）：把契约里「插件真能调到的东西」
   （命名空间方法名、参数个数与顺序、返回语义、`console` 方法、屏蔽全局名单、库注册表）
   规范化后取 sha256。**解耦同时拆掉了一个偶然的保护**：以前「每次发布都推着契约版本走」，
   而现在加了/删了一个 `$lib` 方法而契约版本没动的话，门 2 的 L1/L2/L3 **全是绿的**——它们查的是
   「三处一致」，不是「面变没变」。删掉一个方法而不动契约版本最致命：插件声明的 `minRuntimeVersion`
   会变成谎话（宿主报的版本比它实际提供的能力新），装上去在运行期炸。指纹把这件事变成**显式决定**：
   面变了就必须二选一——递增 `contractVersion`（语义变了），或跑
   `node scripts/contract-gates/run.mjs --record-surface-hash`（只是措辞/顺序修订，语义未变）。
   两条路都要在 diff 里留痕，CI 不得带 `--record-surface-hash`（同门 3 的 `--record` 口径）。
   进指纹的只有**面**：`impl` / `swift.file` / `swift.entry`（实现落点，重构会动而契约没变）与
   `note` 等散文不进；`console.methods`、`blockedGlobals.names`、库的 `globals` 是集合语义，
   排序后入指纹（调换顺序不是契约变更），而 `params` / `requires` / `entries` 的顺序**是**语义，保持原样。
4. **devconsole 的 `--npm-ready` 依赖范围改钉 runtime 的包版本**（顺带修掉一个同类潜伏错）：
   它原先钉的是契约版本。devconsole 消费的是 runtime 的**编程 API**（`import { createSandbox }`），
   那是**包**的面，下界必须是「编译时对着的那一版包」；契约版本可能落后于包版本（门只要求包 ≥ 契约），
   拿它当下界会允许装到比编译基线更老的包。解耦前两者恒等所以看不出来——又一次「两条号段都叫 1.0.x」。
5. **插件侧字段仍叫 `minRuntimeVersion`**：它已随 ADR-0009 发布给插件作者与技能包，语义没变
   （「我需要的最低宿主版本」）。改名的收益只是措辞对称，代价是 31 个插件 + iOS 模型 + 技能模板
   全动一遍——不值。读它时按上表的**契约版本**理解。

否决项：

- **保持「包版本 = 契约版本」（否决）**：就是本 ADR 要解决的问题；契约版本会继续被补丁推着走。
- **只放松成「不相等也行」（否决）**：那会丢掉 L4 腿唯一的防线——iOS 侧拿错基准时整仓插件恒显示
  「不可安装」，不崩不报错（2026-10 实测：公开插件仓 3 个插件全部点不动）。
- **拿包版本当插件 `minRuntimeVersion` 的基准（否决）**：补丁会**假性满足**插件的最低版本要求
  （包 1.2.0 只说明发得多，不说明注入面到了 1.2.0）。
- **契约版本加构建号/日期后缀（否决）**：`minRuntimeVersion` 的比较语义就没了（semver 比较器
  对 `1.0.2+20261017` 是当作 1.0.2 处理的，等于没加）。
- **给 iOS 常量加「≥」容差（否决）**：恒等是唯一能挡住「宿主宣称实现了还没实现的注入面」的口径；
  容差会让 iOS 落后于契约时静默放行，正是最该拦的方向。
- **把契约版本改成日期或哈希（否决）**：插件声明的最低版本要求要能人读、能比较、能承诺。

影响：

- **契约与门**：`contracts/lib-api.json`（字段改名 + `surfaceHash` + 说明）、`contracts/lib-api.md` §0
  （三条号段的表 + 门的三条约束）、`scripts/contract-gates/lib-api.mjs`（L4 重写 + 指纹 +
  `--record-surface-hash`）、`scripts/contract-gates/run.mjs`（透传开关）。
- **iOS**：`ios/Lingshu/Runtime/PluginRuntimeContract.swift`（注释改口径：比契约版本，**不跟包版本**；
  常量值不变）、`ios/LingshuTests/PluginInstallPolicyTests.swift`（绊线注释）、
  `ios/docs/plugin-distribution.md`、`ios/AGENTS.md` 红线。
- **发布管线**：`scripts/publish/transform.mjs`（`runtimePackageVersion()` 取代 `runtimeContractVersion()`）。
- **文档**：`runtime/AGENTS.md` 契约门节、`contracts/README.md`、`docs/opensource/*`（母仓内部文档）、
  `publish/templates/runtime/.github/workflows/release.yml` 注释（原来写「走这条路要先递增契约版本」，
  现在是「递增包版本」——**这正是解耦带来的差别**）。
- **未同步（刻意）**：ADR-0068 正文与 `docs/opensource/execution-phases.md` 的历史行保持原样
  （历史记录不改口径，见 0068 补记与本文）。

验证（负向/正向矩阵，13 例全过；做法：在临时「符号链接农场」里改契约/包版本，`CONTRACT_ROOT` 指过去）：

- 包版本领先契约（`1.1.0` / `2.0.0` > 契约 `1.0.2`）⇒ **绿**（解耦要证明的方向）。
- 包版本落后（`1.0.1` / `0.9.9` < 契约 `1.0.2`）⇒ 红；包版本 `1.0.2-rc.1`（三元组相等但是预发布）⇒ 红。
- 改 `returns` 措辞（L1/L2/L3 都看不见）⇒ **只指纹红**；刷新指纹后 ⇒ 绿；删 `surfaceHash` ⇒ 红。
- iOS 常量 `0.1.0`（拿错号段）/ `1.1.0`（跟着包版本走 = 解耦前的老习惯）⇒ 都红。
- 缺 `contractVersion` / `contractVersion` 非 semver（`1.0`）⇒ 都红。
