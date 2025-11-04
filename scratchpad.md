
# Fit Rooms — .cursor/scratchpad.md

> 本文件由你先创建，Cursor 将据此工作与更新。**不要随意改动章节名**。

## 背景和动机
- 做一个“房间/小队 PK”的健身打卡网页应用，促进连续性与团队协作。
- 用户通过**用户名+密码**登录（不绑定邮箱）。
- 用户可在“房间”中自由组队（2/3 人一队），数据公开，按规则记分与排名。

## 成功标准（验收）
- [ ] 用户可注册/登录（用户名唯一、密码安全存储）。
- [ ] 用户可创建/加入/退出房间；可查看房间码与当日排行榜。
- [ ] 用户可创建/加入队伍（2/3 人），显示队伍成员与当日打卡进度。
- [ ] 用户可在日历里创建未来计划（含循环/重复）；当天 10:00 后默认不可改。
- [ ] 当天 10:00 后仅允许三种“特殊原因”改计划（经期/天气/其他），且在个人主页公开显示原因。
- [ ] 打卡板块能上传/拍照、预览并完成打卡；当日完成后显示“当日已完成打卡”。
- [ ] 评分与统计：
      - 同队**全员当日完成打卡**：小队 +5 分；
      - **连续 ≥3 天全员完成**：每天 +7 分（与 +5 可叠加，总 +12）；
      - **不满足全员**：仅 1 人 +3 分（队伍总分仍只 +3）；
      - 每日**本地时间 23:59**统计当日完成；
      - 每日**北京时间 12:00（UTC+8 12:00）**刷新/公示排名。
- [ ] 排行榜按天/周显示，房间内公开用户与队伍数据。
- [ ] 基于 RLS 的数据隔离，只有同房间成员可见该房间详细数据。

## 关键挑战和分析
1. **跨时区统计**：
   - 以“用户本地时区”在 23:59 进行当日切账，需记录用户时区（IANA tz）。
   - 方案：记录每个用户 `timezone`，使用 Edge Function 按用户 tz 切分并写入 `daily_stats`。
2. **北京时间 12:00 排名刷新**：
   - 独立计划任务（每天 UTC 04:00），统一按前一自然日聚合结果刷新 `leaderboards`。
3. **队伍约束**：队员数只能是 2 或 3；变更队伍需校验、限制频率。
4. **“10:00 后不可改计划”规则**：
   - 以**用户本地时间**为准；仅允许三类理由 override；需保留修改日志并在个人页展示。
5. **RLS & 审计**：
   - 仅房间成员可见房间/队伍详情；操作留痕（created_by、updated_by、timestamps、IP/UA 可选）。
6. **上传/拍照**：
   - 存储到对象存储（如 Supabase Storage），文件命名含房间/用户/日期。

## 数据模型（建议，Postgres / Supabase）
```sql
-- 用户
table users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  timezone text not null default 'America/New_York',
  display_name text,
  created_at timestamptz default now()
);

-- 房间
table rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null,        -- 房间码（短码）
  owner_id uuid not null references users(id),
  created_at timestamptz default now()
);

-- 房间成员
table room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  joined_at timestamptz default now(),
  unique(room_id, user_id)
);

-- 队伍（2/3 人）
table teams (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  name text not null,
  created_by uuid not null references users(id),
  created_at timestamptz default now()
);

-- 队伍成员
table team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  joined_at timestamptz default now(),
  unique(team_id, user_id)
);

-- 计划（可重复）
table plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  details jsonb,                     -- 包含重复规则 RRULE 等
  start_date date not null,
  end_date date,
  created_at timestamptz default now()
);

-- “10:00 后”修改记录（含三种原因）
table plan_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  plan_id uuid references plans(id),
  for_date date not null,
  reason text not null check (reason in ('period','weather','other')),
  note text,
  created_at timestamptz default now()
);

-- 当日打卡
table checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  room_id uuid not null references rooms(id),
  photo_url text,
  taken_at timestamptz not null default now(),
  for_date date not null,            -- 依据用户本地时区映射的“日”
  unique(user_id, room_id, for_date)
);

-- 每日统计（按用户本地日）
table daily_stats (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id),
  team_id uuid references teams(id),
  user_id uuid references users(id),
  stat_date date not null,
  did_checkin boolean not null,
  created_at timestamptz default now(),
  unique(room_id, user_id, stat_date)
);

-- 计分记录（队伍层面）
table team_scores (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id),
  team_id uuid not null references teams(id),
  score_date date not null,
  points integer not null,
  reason text not null,              -- 'all_members', 'streak_3plus', 'single_member'
  created_at timestamptz default now()
);

-- 连续全员达标（用于 +7 连续加分）
table team_streaks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  length integer not null
);

-- 排行榜快照（北京时间 12:00 刷新）
table leaderboards (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id),
  snapshot_date date not null,       -- 以 UTC+8 的前一日为准
  ranking jsonb not null,            -- [{team_id, team_name, points}, ...]
  created_at timestamptz default now(),
  unique(room_id, snapshot_date)
);
```

### RLS（方向性提示）
- `rooms`：成员或房主可读；房主可写；新建时 owner_id=auth.uid()。
- `room_members`/`teams`/`team_members`/`checkins`/`daily_stats`/`team_scores`：仅同房间成员可读写；写操作需校验主体身份。

## 业务规则（可执行逻辑）
- **日切分**：`for_date = (taken_at at time zone user.timezone)::date`
- **每日统计（本地 23:59 触发）**：
  1. 对每个房间的每支队伍，检查当日队员 `did_checkin` 是否全员=TRUE。
  2. 若全员：`team_scores +5 ('all_members')`；同时检查最近是否已连续 ≥3 天全员达标：若是，再 `+7 ('streak_3plus')`。
  3. 若非全员但至少 1 人完成：当天队伍 `+3 ('single_member')`（仅一次）。
- **队伍人数限制**：`count(team_members)` ∈ {2,3}，写入时触发器校验。
- **10:00 后改计划**：若 `now` 过用户本地 10:00，更新 `plans` 需带 `plan_overrides.reason ∈ {period,weather,other}` 并落地日志。

## 前端信息架构（App Router, Next.js）
- 登录页（用户名/密码注册+登录）。
- 个人页（四板块）：
  1) **房间板块**：我所在房间、房间码、加入/创建/退出、当日排行榜、查看成员。
  2) **计划板块**：日历（创建/编辑计划，支持循环）；10:00 后默认不可改；特殊原因改计划入口。
  3) **打卡板块**（居中显眼）：上传/拍照→预览→提交；完成后显示“当日已完成打卡”。
  4) **小队板块**：展示我所在队伍成员当日打卡进度，创建/加入队伍（录入队名）。

## API 草案（REST-ish）
- `POST /auth/signup {username, password}`
- `POST /auth/login {username, password}`
- `POST /rooms {name}` / `POST /rooms/join {code}` / `POST /rooms/leave`
- `POST /teams {room_id, name}` / `POST /teams/join {team_id}`
- `GET  /rooms/:id/leaderboard?date=today`
- `GET  /teams/:id/progress?date=today`
- `POST /plans {title, start_date, rrule?}` / `PATCH /plans/:id`（含 override）
- `POST /checkins {room_id, photo}`（返回 for_date）

## 定时任务（Edge Functions / Cron）
- **本地日统计**：每小时扫描“接近 23:59”窗口用户并结算（或按用户分 bucket）。
- **北京时间 12:00 刷榜**：`CRON: 0 4 * * *`（UTC）生成 `leaderboards` 快照。

## UI 要点
- 打卡按钮主 CTA；打完当天按钮置灰且显示“当日已完成打卡”。
- 排行榜：房间页展示 Top N 团队与我队位置；支持展开详情。
- 计划日历：禁用当天 10:00 后的编辑控件（除“特殊原因 override”）。

---

## 高层任务拆分（规划者）

### 阶段一：项目基础搭建（优先级：高）
- [ ] **1.1** 项目初始化：Next.js 14 + TypeScript + Tailwind CSS
- [ ] **1.2** Supabase 配置：数据库连接、环境变量、类型生成
- [ ] **1.3** 数据库表结构：执行 SQL 脚本创建所有表
- [ ] **1.4** RLS 策略：配置行级安全策略
- [ ] **1.5** 基础 UI 组件：布局、导航、响应式设计

### 阶段二：用户认证系统（优先级：高）
- [ ] **2.1** 用户注册/登录 API：用户名+密码，bcrypt 哈希
- [ ] **2.2** 会话管理：JWT token、中间件保护
- [ ] **2.3** 认证页面：登录/注册表单，错误处理
- [ ] **2.4** 密码安全：强度验证、防暴力破解

### 阶段三：房间管理（优先级：高）
- [ ] **3.1** 房间 CRUD API：创建、加入、退出、查看
- [ ] **3.2** 房间码生成：短码算法、唯一性校验
- [ ] **3.3** 房间页面：房间列表、加入房间、创建房间
- [ ] **3.4** 房间成员管理：邀请、踢出、权限控制

### 阶段四：队伍系统（优先级：中）
- [ ] **4.1** 队伍 CRUD API：创建、加入、退出队伍
- [ ] **4.2** 队伍约束：2-3人限制、触发器校验
- [ ] **4.3** 队伍页面：队伍列表、成员管理、进度展示
- [ ] **4.4** 队伍进度：实时显示成员打卡状态

### 阶段五：打卡系统（优先级：高）
- [ ] **5.1** 文件上传：Supabase Storage 配置
- [ ] **5.2** 打卡 API：上传照片、记录打卡时间
- [ ] **5.3** 打卡页面：拍照/上传、预览、提交
- [ ] **5.4** 打卡状态：当日完成状态、历史记录

### 阶段六：计划管理（优先级：中）
- [ ] **6.1** 计划 CRUD API：创建、编辑、删除计划
- [ ] **6.2** 日历组件：显示计划、支持 RRULE 重复
- [ ] **6.3** 10:00 限制：本地时间校验、特殊原因覆盖
- [ ] **6.4** 计划页面：日历视图、计划管理

### 阶段七：计分统计（优先级：中）
- [ ] **7.1** 每日统计函数：23:59 本地时间切分
- [ ] **7.2** 计分逻辑：全员+5、连续+7、单人+3
- [ ] **7.3** 定时任务：Edge Functions 或 Cron Jobs
- [ ] **7.4** 统计页面：个人/队伍统计、历史数据

### 阶段八：排行榜（优先级：中）
- [ ] **8.1** 排行榜生成：UTC+8 12:00 刷新
- [ ] **8.2** 排行榜 API：按天/周查询
- [ ] **8.3** 排行榜页面：房间排名、队伍排名
- [ ] **8.4** 实时更新：WebSocket 或轮询

### 阶段九：优化与测试（优先级：低）
- [ ] **9.1** 性能优化：图片压缩、懒加载、缓存
- [ ] **9.2** 错误处理：全局错误边界、用户友好提示
- [ ] **9.3** 单元测试：关键函数测试
- [ ] **9.4** 端到端测试：用户流程测试
- [ ] **9.5** 部署：Vercel + Supabase 生产环境

## 项目状态看板（执行者维护）

### 当前阶段：阶段七 - 计分统计
**目标**：按用户本地时区在 23:59 切分并沉淀每日打卡结果，为计分与排行打基础

### TODO（按优先级排序）
- **7.3** 定时任务：调度每日结算与记分（Edge Functions Scheduled Triggers）
- **7.4** 统计页面：个人/队伍统计、历史数据

### DOING
- （空）

### DONE
- 项目需求分析和任务拆分完成
- **1.1** 项目初始化：Next.js 14 + TypeScript + Tailwind CSS
- **1.2** Supabase 配置：数据库连接、环境变量、类型生成
- **1.3** 数据库表结构：创建表/约束/索引 + 类型生成
- **1.4** RLS 策略配置：策略 SQL、迁移、基本测试
- **1.5** 基础 UI 组件：布局、导航、组件库、页面骨架
- **1.6** 认证与会话：登录/注册、JWT 会话、路由保护
- **1.7** 房间功能（创建/加入/退出、房间码、成员列表、导航集成）
- **4.1** 队伍基础功能：创建/加入/退出、成员列表、房主移除成员、API 与 UI 整合
- **4.2** 队伍约束：数据库触发器限制队伍成员 ≤ 3，并通过 `pnpm build` 验证
- **4.3** 队伍页面（SSR 数据加载 + TeamShell 对接、切换房间刷新队伍列表、成员操作与状态）
- **4.4** 队伍进度：`/api/teams` 返回当日打卡状态、`TeamShell` 显示成员完成标记并轮询刷新
- **5.1** 文件上传：创建 `checkins` bucket、RLS policy、服务端上传辅助 `uploadCheckinImage` 及 `/api/uploads/checkin` 接口；构建通过
- **5.2** 打卡 API：`/api/checkins` 写入数据库、去重校验、返回 `for_date/taken_at`，构建通过
- **5.3** 打卡页面：拍照/上传、预览、提交（选择房间、调用 `/api/checkins`、处理成功/重复）；构建通过
- **5.4** 打卡状态与历史：新增 `/api/checkins/today` 与 `/api/checkins?roomId&limit`，页面显示“今日状态”与“最近 7 天”并可刷新；构建通过
- **6.1** 计划 CRUD API：创建、编辑、删除、查询（按用户）；构建通过
- **6.2** 日历组件：月视图、计划 API、RRULE（日/周）展开，点击日期查看当日计划；构建通过
- **6.3** 10:00 限制：本地时间校验、override API、前端流程；`pnpm lint`/`pnpm build` 通过
- **6.4** 计划页面交互完善：创建/编辑表单对接 API、10:00 锁定联动 override、删除覆盖、override 历史展开；构建与 Lint 通过
- **7.1** 每日统计（本地 23:59 切分）：Edge Function `settle_daily_stats` + README + dry-run/写入接口，构建与 Lint 通过
- **7.2** 计分逻辑：Edge Function `settle_team_scores` + README + dry-run/写入接口，构建与 Lint 通过

### 规划者指令
-**下一步行动**：执行阶段七的任务 7.3 - 定时任务（调度每日结算与记分）
**具体要求**：
1. 为 `settle_daily_stats` 配置计划调度：建议每 15 分钟触发一次（Cron：`*/15 * * * *`）
   - 函数内部已按各用户时区判断 23:59 窗口，仅在到达窗口时写入（重复安全）
2. 为 `settle_team_scores` 配置计划调度：建议在每日 UTC 04:10 触发（Cron：`10 4 * * *`）
   - 避免与上一步窗口冲突；可适当错开 5–10 分钟
3. 部署与环境：使用 `supabase functions deploy` 部署两个函数；在 Supabase Dashboard 配置 Scheduled Triggers（或使用平台提供的调度配置）
4. 观测与回滚：
   - 为两函数开启日志观测；出现异常时支持 `dryRun` 重放和人工修正
   - README 中记录调度表达式、变更记录与回滚方案

**成功标准**：
- 两个函数按设定时间可靠触发；日志可见成功执行，失败有错误记录
- 重复触发不产生重复数据（幂等校验生效）
- 文档（README 或 `docs/ops.md`）清晰记录调度策略与 SLO/回退

**手动检查**：
- 在 Dashboard 手动触发（或临时改为每分钟）观察 dry-run 与实写入效果
- 人为造数：准备 2 个时区的用户与队伍，验证 stats 与 scores 在下一次触发后正确落库
- 调整 Cron 到 1 分钟间隔，观察连续多次触发不重复记分/写入