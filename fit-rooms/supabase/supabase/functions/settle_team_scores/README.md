# settle_team_scores 函数说明

## 功能概述
- 根据 `daily_stats` 统计每日队伍得分，写入 `team_scores`
  - 全员完成：`points=5, reason='all_members'`
  - 连续 ≥3 天全员完成：额外 `points=7, reason='streak_3plus'`
  - 非全员但有人完成：`points=3, reason='single_member'`
- 维护 `team_streaks`，跟踪连续全员达标区间
- 支持 dry-run 预览与幂等执行

## 请求参数
| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| `date` | `YYYY-MM-DD`（可选） | 指定结算日，默认当天 |
| `dryRun` | `true/false`（可选） | dry-run 时仅返回预览，不写入数据库 |

## 本地调用
```bash
# 预览 2025-10-14 的得分
curl -X GET "http://127.0.0.1:54321/functions/v1/settle_team_scores?dryRun=true&date=2025-10-14" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# 实际写入
curl -X GET "http://127.0.0.1:54321/functions/v1/settle_team_scores?date=2025-10-14" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```
- dry-run 返回 `{ dryRun: true, scores: PendingScore[], streaks: PendingStreakChange[] }`
- 实际执行返回 `{ dryRun: false, insertedScores, streakChanges }`

## 部署与调度
1. `pnpm dlx supabase@latest functions deploy settle_team_scores`
2. 配置与 `settle_daily_stats` 相同的 Scheduled Trigger（可 15 分钟一次），在每日 23:59 后运行
   - 函数内部按 `daily_stats` 判断，不会重复记分

## 注意事项
- 必须使用 Service Role Key 调用（需写入数据库）
- 函数分页遍历 `teams`，默认页容量 100；可根据数据量调整 `PAGE_SIZE`
- `team_scores` 使用 `resolution=merge-duplicates`，同日同队同 reason 幂等
- `team_streaks` 在全员达标日创建或延长 streak，否则保持原状

## 故障排查
- 函数日志会输出错误详情，可据此定位异常队伍或请求
- 若 dry-run `scores`/`streaks` 为空，说明当日没有满足条件的队伍
- 如需对特定日重新结算，可传入 `date` 并重新执行（幂等）
