# Fit Rooms

Fit Rooms 是一个面向健身房间/小队 PK 的全栈 Web 应用，帮助团队成员互相激励并坚持每日打卡。项目基于 Next.js 14 App Router、TypeScript、Tailwind CSS 和 Supabase 构建，支持跨时区统计、实时排行榜、文件上传等关键功能。

## 功能简介
- 用户注册/登录（用户名 + 密码，安全哈希存储）
- 房间创建 / 加入 / 退出，支持分享房间码
- 队伍管理（2/3 人一队），实时显示成员打卡进度
- 打卡上传、预览，当日唯一打卡限制
- 计划日历（支持重复、10:00 限制、三类 override）
- 计分规则：全员 +5，连续 ≥3 天 +7 叠加，单人完成 +3
- 排行榜：每日 23:59 统计，UTC+8 12:00 刷新快照
- 基于 RLS 的数据隔离与审计跟踪

## 目录结构
```
fit-rooms/
├── src/
│   ├── app/            # Next.js App Router 页面
│   ├── components/     # 通用组件
│   ├── lib/            # 工具函数、Supabase 客户端等
│   └── styles/         # 全局样式与 Tailwind 配置
├── public/             # 静态资源
├── eslint.config.mjs   # ESLint 配置
├── postcss.config.mjs  # PostCSS 配置
├── tailwind.config.ts  # Tailwind CSS 配置
├── tsconfig.json       # TypeScript 配置
└── pnpm-lock.yaml      # pnpm 锁定文件
```

## 快速开始
```bash
# 环境变量（根据实际 Supabase 项目填写）
cat <<'EOF' > .env.local
NEXT_PUBLIC_SUPABASE_URL=your-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role
JWT_SECRET=your-secret
EOF

# 安装依赖
pnpm install

# 本地开发
pnpm dev

# Lint 检查
pnpm lint

# 构建产物
pnpm build
```

启动后访问 http://localhost:3000 查看应用。

## 技术栈
- Next.js 14 App Router
- TypeScript 5.9+
- Tailwind CSS 4.1+
- Supabase：PostgreSQL、Auth、Storage、Edge Functions

## 项目约定
- 使用 App Router 架构与 Server Components 优先策略
- ESLint + Prettier 统一代码风格
- API 调用通过 Supabase 行级安全策略校验
- 重要日志包含 trace id / request id 方便排查

## 贡献指南
1. Fork 仓库并创建分支（`feature/xxx`）
2. 确保 `pnpm lint` 无报错
3. 补充必要测试或说明
4. 提交 PR 等待审核

## 许可
本项目暂未指定开源许可证，内部使用为主。
