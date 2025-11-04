### Supabase CLI 与数据库迁移

#### 安装与登录
```bash
# 全局安装或使用 npx/pnpm dlx
pnpm add -g supabase

# 登录 Supabase 账户
supabase login
```

#### 本地开发流程
```bash
# 1. 初始化本地 Supabase 环境
supabase init

# 2. 启动本地服务
supabase start

# 3. 创建新的迁移文件
supabase migration new <migration_name>

# 4. 将 SQL DDL 写入迁移文件 (supabase/migrations/<timestamp>_<name>.sql)
#    - create table, alter table, etc.

# 5. 应用迁移到本地数据库
supabase db reset

# 6. 生成 TypeScript 类型
supabase gen types typescript --local > src/lib/types/database.ts
```

#### 远程部署流程
```bash
# 1. 链接远程项目（首次）
supabase link --project-ref <your-project-id>

# 2. 推送本地迁移到远程数据库
#    注意：此操作不可逆，请在生产环境谨慎操作
supabase db push
```

#### 与本项目相关的注意事项

- **`db push` vs `migrations`**：`supabase db push` 直接将本地 schema 推送到远程，适合快速原型开发。对于生产项目，推荐使用 `supabase migration up` 等迁移工作流，更安全可控。
- **`schema.sql`**：本项目中的 `supabase/schema.sql` 是一个完整的 schema 定义，可以将其内容复制到第一个迁移文件中（例如 `supabase/migrations/0000_init.sql`）。
- **类型生成**：当数据库 schema 变更后，应重新运行 `supabase gen types` 命令更新 TypeScript 类型。

### 错误与调试

#### 常见报错

1. **认证失败**
   - **原因**：`SUPABASE_ACCESS_TOKEN` 过期或无效。
   - **解决**：重新运行 `supabase login`。

2. **`db push` 冲突**
   - **原因**：远程数据库 schema 与本地不一致，且存在无法自动解决的冲突。
   - **解决**：使用迁移工作流替代 `db push`，或者先将远程 schema 拉到本地 (`supabase db pull`)。

3. **类型生成失败**
   - **原因**：无法连接到数据库或 project-id 错误。
   - **解决**：检查网络连接和项目配置。

#### 排查步骤

1. 使用 `--debug` 标志运行命令获取详细日志：`supabase --debug <command>`
2. 检查 `supabase/config.toml` 文件是否正确。
3. 确认本地 Docker 环境是否正常运行。
