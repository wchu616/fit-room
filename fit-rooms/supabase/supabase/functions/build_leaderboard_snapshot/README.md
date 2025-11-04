# build_leaderboard_snapshot 函数说明

## 功能概述
- 按房间汇总 `team_scores`，生成指定日期（默认前一自然日）的排行榜快照
- 数据写入 `public.leaderboards`（列：`room_id`, `snapshot_date`, `ranking`）
- 幂等：同房间+日期重复执行不会产生重复记录
- 支持 `dryRun` 预览、指定日期回放

## 本地调用
```bash
# dry-run：生成 2025-10-14 的排行榜（仅返回预览，不落库）
curl -X POST "http://127.0.0.1:54321/functions/v1/build_leaderboard_snapshot" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date":"2025-10-14","dryRun":true}'

# 实际写入（去掉 dryRun 或设为 false）
curl -X POST "http://127.0.0.1:54321/functions/v1/build_leaderboard_snapshot" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date":"2025-10-14"}'
```

## 环境变量
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## 注意事项
- Cron 调度建议：每日 UTC 04:00（北京时间 12:00）执行，生成前一自然日快照
- 若需要回滚，可删除目标日期的快照后重新执行（支持 `dryRun` 验证）
