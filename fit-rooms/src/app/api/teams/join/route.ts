import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { joinTeam } from "@/lib/teams";
import { joinTeamSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "未登录用户无法加入队伍" }, { status: 401 });
    }

    const body = await request.json();
    const result = joinTeamSchema.safeParse(body);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "请求参数错误";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    try {
      await joinTeam({ teamId: result.data.teamId, userId: session.user.id });
      return NextResponse.json({ joined: true }, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "加入队伍失败";
      if (message.includes("人数")) {
        return NextResponse.json({ error: message }, { status: 409 });
      }
      if (message.includes("不存在")) {
        return NextResponse.json({ error: message }, { status: 404 });
      }
      if (message.includes("房间")) {
        return NextResponse.json({ error: message }, { status: 403 });
      }
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器异常";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
