import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const overviewSections = [
  {
    title: "房间",
    description: "查看我加入的房间、成员和排行榜。",
    href: "/rooms",
  },
  {
    title: "计划",
    description: "维护训练计划，支持循环安排与 10:00 锁定。",
    href: "/plans",
  },
  {
    title: "打卡",
    description: "上传打卡照片，查看历史记录并跟踪 streak。",
    href: "/checkin",
  },
  {
    title: "小队",
    description: "管理小队成员、查看状态，保持连胜奖励。",
    href: "/team",
  },
  {
    title: "统计",
    description: "查看个人与小队的历史记录、积分走势与榜单。",
    href: "/stats",
  },
];

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">欢迎回来</h1>
          <p className="text-sm text-black/60">快速总览今日状态，跳转到各模块处理任务。</p>
        </div>
        <Button asChild>
          <Link href="/checkin">立即打卡</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {overviewSections.map((section) => (
          <Card key={section.href} padded>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="secondary">
                <Link href={section.href}>进入 {section.title}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
