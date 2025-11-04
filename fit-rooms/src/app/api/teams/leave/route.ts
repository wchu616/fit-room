import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { leaveTeam } from "@/lib/teams";
import { leaveTeamSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "未登录用户无法退出队伍" }, { status: 401 });
    }

    const body = await request.json();
    const result = leaveTeamSchema.safeParse(body);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "请求参数错误";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    try {
      const response = await leaveTeam({ teamId: result.data.teamId, userId: session.user.id });
      return NextResponse.json(response, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "退出队伍失败";
      if (message.includes("不在")) {
        return NextResponse.json({ error: message }, { status: 404 });
      }
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器异常";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
