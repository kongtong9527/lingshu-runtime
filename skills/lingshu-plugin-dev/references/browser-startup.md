# 浏览器启动与恢复（frx-director 前置检查全文）

> 归属：SKILL.md「阶段 0」的全文落点。SKILL 主文件只留入口 + 红线；`frx_env_open` 速死的三选一排查仍在 `pitfalls.md`「Marionette 起不来」条，本文件只做恢复链路，不重复。
>
> **实时为准原则**：frx-director-mcp 更新频繁，开工前先实时读取官方 README（`https://raw.githubusercontent.com/WhiteNightShadow/frx-director-mcp/refs/heads/main/README.md`）的“快速开始 / 工具接入自检 / 工具参考 / 版本更新记录”四节，再以 `frx_status` + `agent_tools` 返回为准。本文的工具名、数量、端口、启动参数均为快照，过期以实时读取为准。

判定以 `frx_status` 的 `bridgeConnected` / `ready` / `hasKey` 为准（`startup.reachable=false` 可能是 stale 检测，不必理会，具体字段以 README 实时节 + `frx_status` 返回为准）。

## 1. 绿灯（直接开工）

`bridgeConnected=true` 且 `ready=true` → 再调 `agent_tools` 确认浏览器工具目录可用（编写时基线为官方 v0.24.0 的 `count:68`、`missingDeclared:[]`，实际以 README 当前版本 + `agent_tools` 返回为准），开工。委派 worker 还需 `hasKey=true`；直驱则 `hasKey=false` 也能开工。

桥通但要换环境 → 先 `frx_env_close` 当前环境，再 `frx_env_open` 目标环境（**一环境一实例**，同 profile 双开会抢锁速死；工具名前缀去客户端前缀后以 README 为准）。

## 2. 桥断（`2828 不可达`、`frx_env_*` 连带 `ECONNREFUSED`）

此时 `frx_env_open` 同样不可用，不要无脑重试。先排除服务端自拉起：配了 `FRX_AUTOLAUNCH=1` + `FRX_FIREFOX_BIN`/`FRX_PROFILE` 则 MCP 服务端会自动拉起，等半分钟再查一次 `frx_status`；仍不通才手动（环境变量名与启动参数以 README 实时节为准）：

```bash
ps aux | grep "firefox -marionette" | grep -v grep  # 谁在跑、带哪个 --profile
lsof -i :2828 -i :2829                             # 2828=桥（lsof 显示为 itm-lm），空=无实例
cat ~/.firefox-reverse/environments/manifest.json  # 查目标环境的 profilePath
grep marionette.port <profile>/user.js <profile>/prefs.js  # 桥固定连 2828，被改写才需改回
```

- 有残留 `.parentlock` 且对应进程已死 → 删掉（`<profile>/.parentlock`）。
- 用官方启动链路重拉（macOS，必须走 `open -n -a … --args`，**不要直接拉二进制**，否则 Firefox Reverse 可能短暂启动后退出；不要自创 `--marionette-port` 参数，Firefox 153 不识别，改端口走 `FRX_MARIONETTE_PORT`）：

```bash
open -n -a "/Applications/Firefox Reverse.app" --args \
  -marionette -remote-allow-system-access -no-remote -profile <profile>
```

- `lsof -i :2828` 见监听 + `frx_status` 确认 `bridgeConnected=true` 后开工。此时 `control/runtime.json` 显示滞后（仍为 stopped），以实际进程为准。

## 3. 桥通但 `frx_env_open` 速死

`Firefox exited before Marionette became ready`（`startupDurationMs` 仅几百毫秒，正常约 1.1～1.3s）→ 见 `pitfalls.md`「Marionette 起不来」条按三选一排查（同 profile 抢锁 / 端口被改写 / 误杀桥进程）。

## 4. `hasKey=false`（仅卡委派，不卡直驱）

直驱照常开工；要走委派 worker 则按 README 第 0 步引导用户在浏览器 Agent 设置里为便宜 worker 模型配 Key（选型以 README“前置条件”实时节为准），配完再 `frx_status` 确认 `hasKey=true`。

## 红线

- **绝不在 `bridgeConnected=true` 时 kill Firefox**（会把桥一起掐断，所有 MCP 工具全挂）。
- `open -a "Firefox Reverse"` 普通启动**不带 marionette**，连不上桥，无用。
- 启停统一走 `frx_env_open` / `frx_env_close`，手动拉起只是桥断后的恢复手段。
