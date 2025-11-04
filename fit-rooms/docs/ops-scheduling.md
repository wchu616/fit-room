# 定时任务配置说明

## Edge Functions
| 函数 | 说明 | 调度建议 |
| ---- | ---- | ---- |
| `settle_daily_stats` | 按用户时区在 23:59 切分，写入 `daily_stats` | 每 15 分钟轮询一次（Cron：`*/15 * * * *`） |
| `settle_team_scores` | 根据 `daily_stats` 计分并维护 streak | 每日 UTC 04:10 （Cron：`10 4 * * *`） |
| `build_leaderboard_snapshot` | 汇总 `team_scores` 生成排行榜快照（前一自然日） | 每日 UTC 04:20 （Cron：`20 4 * * *`） |

> 说明：`settle_daily_stats` 内部只处理已经到达 23:59 窗口的用户；`settle_team_scores` 建议在 `settle_daily_stats` 触发完成后的 5–10 分钟执行；`build_leaderboard_snapshot` 再延迟约 10 分钟（UTC 04:20），确保计分完成后再生成快照。

## 部署步骤
1. 确保 `.env`/Supabase 项目中设置了 `SUPABASE_URL` 与 `SUPABASE_SERVICE_ROLE_KEY`
2. 本地构建验证：`pnpm lint && pnpm build`
3. 部署函数：
```bash
pnpm dlx supabase@latest functions deploy settle_daily_stats
pnpm dlx supabase@latest functions deploy settle_team_scores
```
4. 前往 Supabase Dashboard → Edge Functions → Scheduled Triggers：
   - 为 `settle_daily_stats` 新增 Cron：`*/15 * * * *`
   - 为 `settle_team_scores` 新增 Cron：`10 4 * * *`
   - Headers：`Authorization: Bearer <service-role-key>`（Supabase 会自动附带）

## 外部调度（GitHub Actions）
若项目暂未开放 Scheduled Triggers，可使用 GitHub Actions 进行轮询调用：
- 工作流文件：
  - `.github/workflows/settle-daily-stats.yml`（每 15 分钟请求 `settle_daily_stats`）
  - `.github/workflows/settle-team-scores.yml`（每日 UTC 04:10 请求 `settle_team_scores`）
  - `.github/workflows/build-leaderboard.yml`（每日 UTC 04:20 请求 `build_leaderboard_snapshot`）
- 仓库 Secrets：
  - `SUPABASE_FUNCTIONS_URL`：`https://<project-ref>.functions.supabase.co`
  - `SUPABASE_SERVICE_ROLE_KEY`
- 两个工作流均支持 `workflow_dispatch` 手动触发；定义了 `concurrency`，重复执行安全
- 运行顺序建议：`settle_daily_stats` → `settle_team_scores`（UTC 04:10）→ `build_leaderboard_snapshot`（UTC 04:20），函数内部均为幂等
- 观察：留意 Actions 日志 + Supabase Function 日志（建议保留最近 10 次执行的链接），异常时可临时改为 `dryRun=true`

## 日志与观测
- Supabase Functions 页面可查看执行日志、错误栈；建议开启 Email/Slack 告警（optional）
- dry-run 调试示例：
```bash
# 日切：
curl -X GET "https://<project>.functions.supabase.co/settle_daily_stats?dryRun=true&date=2025-10-14" \
  -H "Authorization: Bearer <service-role-key>"

# 计分：
curl -X GET "https://<project>.functions.supabase.co/settle_team_scores?dryRun=true&date=2025-10-14" \
  -H "Authorization: Bearer <service-role-key>"

# 排行榜：
curl -X POST "https://<project>.functions.supabase.co/build_leaderboard_snapshot" \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{"date":"2025-10-14","dryRun":true}'
```
- 如果 dry-run 结果正常，再去掉 `dryRun` 参数执行正式结算/快照

## 回滚与重放
- 各函数均为幂等，可在修复异常后重新运行同一日期：
  - `settle_daily_stats?date=YYYY-MM-DD`
  - `settle_team_scores?date=YYYY-MM-DD`
  - `build_leaderboard_snapshot`（POST `{ "date": "YYYY-MM-DD" }`）
- 若产生错误写入，可手动删除错写的 `daily_stats`、`team_scores` 或 `leaderboards` 记录后重新执行
- 建议在 README 或本文件记录每次调度调整（Cron 改动、手动重放日期等）；可附上执行日志链接或 curl 命令
- 压测或突发异常时，可先将工作流改为 `dryRun`，确认无误后再恢复为实写

## SLO 建议
- `settle_daily_stats`：在本地时间 00:10 前完成所有用户的日切分（15 分钟轮询覆盖）
- `settle_team_scores`：在 UTC+8 12:00 前完成得分更新；若失败，保持 dry-run + 手动补分能力
- `build_leaderboard_snapshot`：在 UTC+8 12:10 前完成快照，失败时 10 分钟内告警并支持重跑
- 所有调度任务失败时应在 30 分钟内有告警并允许手动重放

## 故障排查与告警
- **常见告警渠道**：GitHub Actions 失败通知 + Supabase Function 错误日志（建议配置 Email/Slack）
- **常见异常与处理**：
  - `settle_daily_stats` 失败：检查 SUPABASE_SERVICE_ROLE_KEY 是否过期、Auth API 限流；dry-run 重放单日
  - `settle_team_scores` 失败：确认 `daily_stats` 是否落表；若重复记分，删除对应日期 `team_scores` 后重新执行
  - `build_leaderboard_snapshot` 失败：检查前两步是否完成；删除当日 `leaderboards` 快照后重新执行
- **排查建议**：
  - 记录最近 10 次 GitHub Actions 执行链接，便于回滚和复盘
  - Supabase Function 日志配合时间戳、入参（date/dryRun）追踪
  - 复现问题时优先使用 `dryRun=true`，确认无误后再执行正式写入

