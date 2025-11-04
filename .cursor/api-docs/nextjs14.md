# Next.js 14 (App Router)

## 简介（用途与适用场景）

Next.js 14 是 React 的全栈框架，专注于生产环境优化。App Router 是新的路由系统，提供更强大的功能如嵌套布局、流式渲染、服务器组件等。适用于构建现代 Web 应用，特别是需要 SEO 优化、性能优化和全栈功能的项目。

## 安装与初始化

```bash
# 使用 create-next-app 创建新项目
npx create-next-app@latest my-app --typescript --tailwind --eslint --app

# 或使用 pnpm
pnpm create next-app@latest my-app --typescript --tailwind --eslint --app

# 安装额外依赖
npm install @supabase/supabase-js bcryptjs jsonwebtoken
npm install -D @types/bcryptjs @types/jsonwebtoken
```

## 核心概念速览

| 概念 | 说明 | 文件位置 |
|------|------|----------|
| App Router | 新的路由系统，基于文件系统 | `app/` 目录 |
| Server Components | 在服务器端渲染的组件 | 默认所有组件 |
| Client Components | 在客户端渲染的组件 | 使用 `'use client'` |
| Layouts | 共享的 UI 布局 | `app/layout.tsx` |
| Pages | 路由页面 | `app/page.tsx` |
| Loading | 加载状态 | `app/loading.tsx` |
| Error | 错误处理 | `app/error.tsx` |
| Middleware | 请求拦截 | `middleware.ts` |

## 常用 API / 配置

### 用法与参数说明

#### App Router 文件约定

| 文件名 | 类型 | 必填 | 默认 | 说明 |
|--------|------|------|------|------|
| `layout.tsx` | React Component | 是 | - | 共享布局组件 |
| `page.tsx` | React Component | 是 | - | 页面组件 |
| `loading.tsx` | React Component | 否 | - | 加载状态组件 |
| `error.tsx` | React Component | 否 | - | 错误处理组件 |
| `not-found.tsx` | React Component | 否 | - | 404 页面 |
| `route.ts` | API Route | 否 | - | API 路由处理 |

#### 服务器操作 (Server Actions)

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `async` | boolean | 是 | true | 异步函数 |
| `revalidatePath` | string | 否 | - | 重新验证路径 |
| `revalidateTag` | string | 否 | - | 重新验证标签 |

### 最小可运行示例

#### 基础 App Router 结构

```typescript
// app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Fit Rooms',
  description: '健身打卡应用',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh">
      <body className={inter.className}>
        <nav className="bg-blue-600 text-white p-4">
          <h1>Fit Rooms</h1>
        </nav>
        <main className="container mx-auto p-4">
          {children}
        </main>
      </body>
    </html>
  )
}
```

```typescript
// app/page.tsx
import { Suspense } from 'react'
import { getRooms } from '@/lib/actions'

export default async function HomePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">我的房间</h1>
      <Suspense fallback={<div>加载中...</div>}>
        <RoomsList />
      </Suspense>
    </div>
  )
}

async function RoomsList() {
  const rooms = await getRooms()
  return (
    <div className="grid gap-4">
      {rooms.map((room) => (
        <div key={room.id} className="border p-4 rounded">
          <h2>{room.name}</h2>
          <p>房间码: {room.code}</p>
        </div>
      ))}
    </div>
  )
}
```

#### 服务器操作示例

```typescript
// lib/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createRoom(formData: FormData) {
  const name = formData.get('name') as string
  
  // 验证输入
  if (!name || name.length < 2) {
    throw new Error('房间名称至少需要2个字符')
  }
  
  // 创建房间逻辑
  const room = await createRoomInDB(name)
  
  // 重新验证页面
  revalidatePath('/rooms')
  
  // 重定向到新房间
  redirect(`/rooms/${room.id}`)
}

export async function checkinUser(roomId: string, photo: File) {
  // 打卡逻辑
  const result = await processCheckin(roomId, photo)
  
  revalidatePath(`/rooms/${roomId}`)
  revalidateTag('daily-stats')
  
  return result
}
```

#### API 路由示例

```typescript
// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()
    
    // 验证用户
    const user = await getUserByUsername(username)
    if (!user || !await bcrypt.compare(password, user.password_hash)) {
      return NextResponse.json(
        { error: '用户名或密码错误' },
        { status: 401 }
      )
    }
    
    // 生成 JWT
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    )
    
    return NextResponse.json({ token, user: { id: user.id, username: user.username } })
  } catch (error) {
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    )
  }
}
```

## 进阶与最佳实践

### 错误与调试

#### 常见报错

1. **"use client" 位置错误**
   ```typescript
   // ❌ 错误：在服务器组件中使用客户端功能
   export default function MyComponent() {
     const [state, setState] = useState(0) // 错误
   }
   
   // ✅ 正确：添加 'use client' 指令
   'use client'
   export default function MyComponent() {
     const [state, setState] = useState(0)
   }
   ```

2. **服务器组件中使用浏览器 API**
   ```typescript
   // ❌ 错误：在服务器组件中使用 localStorage
   export default function MyComponent() {
     const data = localStorage.getItem('key') // 错误
   }
   
   // ✅ 正确：在客户端组件中使用
   'use client'
   export default function MyComponent() {
     useEffect(() => {
       const data = localStorage.getItem('key')
     }, [])
   }
   ```

#### 排查步骤

1. 检查组件是否标记了正确的 `'use client'`
2. 确认 API 路由返回正确的响应格式
3. 使用 `console.log` 在服务器端调试
4. 检查环境变量是否正确配置

### 性能与安全要点

#### 性能优化

1. **使用 Suspense 进行流式渲染**
   ```typescript
   <Suspense fallback={<Loading />}>
     <SlowComponent />
   </Suspense>
   ```

2. **图片优化**
   ```typescript
   import Image from 'next/image'
   
   <Image
     src="/photo.jpg"
     alt="打卡照片"
     width={400}
     height={300}
     priority // 首屏图片
   />
   ```

3. **动态导入**
   ```typescript
   import dynamic from 'next/dynamic'
   
   const Calendar = dynamic(() => import('@/components/Calendar'), {
     loading: () => <p>加载日历...</p>
   })
   ```

#### 安全要点

1. **环境变量保护**
   ```typescript
   // .env.local
   JWT_SECRET=your-secret-key
   SUPABASE_URL=your-supabase-url
   SUPABASE_ANON_KEY=your-anon-key
   ```

2. **输入验证**
   ```typescript
   import { z } from 'zod'
   
   const loginSchema = z.object({
     username: z.string().min(2).max(20),
     password: z.string().min(6)
   })
   ```

### 与本项目相关的注意事项

#### 用户名+密码登录
- 使用 Server Actions 处理认证
- 密码使用 bcrypt 哈希存储
- JWT token 存储在 httpOnly cookie 中

#### 房间/队伍管理
- 使用 RLS (Row Level Security) 确保数据隔离
- 房间码生成使用短码算法
- 队伍人数限制通过数据库约束实现

#### 23:59 统计
- 使用 Edge Functions 或 Cron Jobs
- 按用户时区进行日切分
- 使用 Supabase 的定时任务功能

#### UTC+8 12:00 刷新
- 北京时间 12:00 = UTC 04:00
- 使用 `CRON: 0 4 * * *` 配置
- 生成排行榜快照并存储

## 版本差异与迁移提示

### Next.js 13 → 14 主要变更

1. **App Router 稳定**
   - App Router 现在是默认推荐
   - Pages Router 仍然支持但不再推荐

2. **服务器组件默认**
   - 所有组件默认为服务器组件
   - 需要客户端功能时使用 `'use client'`

3. **新的缓存策略**
   - `revalidatePath` 和 `revalidateTag` 更强大
   - 部分预渲染 (Partial Prerendering) 支持

4. **Turbopack 支持**
   - 开发环境可以使用 Turbopack
   - 更快的热重载和构建

### 迁移步骤

1. 更新 `next.config.js` 配置
2. 将 `pages/` 目录迁移到 `app/` 目录
3. 更新 API 路由到新的 `route.ts` 格式
4. 添加 `'use client'` 到需要客户端功能的组件

## 官方文档与参考链接

- [Next.js 14 官方文档](https://nextjs.org/docs)
- [App Router 指南](https://nextjs.org/docs/app)
- [服务器组件文档](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
- [客户端组件文档](https://nextjs.org/docs/app/building-your-application/rendering/client-components)
- [服务器操作文档](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)
- [API 路由文档](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [中间件文档](https://nextjs.org/docs/app/building-your-application/routing/middleware)
- [部署指南](https://nextjs.org/docs/app/building-your-application/deploying)
