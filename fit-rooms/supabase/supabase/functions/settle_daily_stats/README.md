# settle_daily_stats 函数说明

## 功能概述
- 按用户本地时区计算每日 23:59 切分结果
- 汇总 `public.checkins`，将结果 UPSERT 至 `public.daily_stats`（列：`room_id`, `user_id`, `stat_date`, `did_checkin`）
- 支持 dry-run 预览、指定日期/时区、幂等执行

## 请求参数
| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| `date` | `YYYY-MM-DD`（可选） | 指定结算日，不填写则取当前时间并按时区换算 |
| `tz` | IANA 时区字符串（可选） | 覆盖默认的用户时区，仅用于调试单时区 |
| `dryRun` | `true/false`（可选） | 为 `true` 时仅返回预览结果，不写入数据库 |

## 本地调用
```bash
# dry-run 预览：
curl -X GET "http://127.0.0.1:54321/functions/v1/settle_daily_stats?dryRun=true&tz=Asia/Shanghai&date=2025-10-14" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"

# 实际写入（去掉 dryRun）：
curl -X GET "http://127.0.0.1:54321/functions/v1/settle_daily_stats?tz=Asia/Shanghai&date=2025-10-14" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```
- dry-run 返回 `{ dryRun: true, count, stats[] }`
- 正式执行返回 `{ dryRun: false, inserted }`

## 部署与调度
1. 在项目根目录执行 `pnpm dlx supabase@latest functions deploy settle_daily_stats`
2. 配置 Supabase Scheduled Trigger（15 分钟一次）指向该函数
   - 建议 payload 为空，让函数内部自判“已到 23:59 时段”的用户

## 日志与排查
- 函数中的错误会记录在 Edge Function 日志中，包含具体错误信息
- 若需调试单个用户，可传 `tz` + `date` + `dryRun=true` 观察 stats 列表
- 若无房间/打卡记录，会返回 `count: 0`

## 注意事项
- 使用 Service Role Key（写入数据库）
- 函数内部默认分页 100 条 Auth 用户，若用户量大可调整 `PAGE_SIZE`
- `daily_stats` UPSERT 使用 `(room_id, user_id, stat_date)` 唯一键，重复执行不会产生重复记录
