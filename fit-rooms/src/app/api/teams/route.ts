import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { createTeam, listTeamsByRoom } from "@/lib/teams";
import { createTeamSchema, teamListQuerySchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "未登录用户无法获取队伍" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parseResult = teamListQuerySchema.safeParse({ roomId: searchParams.get("roomId") });
    if (!parseResult.success) {
      const message = parseResult.error.issues[0]?.message ?? "房间 ID 无效";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    try {
      const teams = await listTeamsByRoom({ roomId: parseResult.data.roomId, userId: session.user.id });
      return NextResponse.json({ teams }, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "获取队伍失败";
      if (message.includes("仅房间成员")) {
        return NextResponse.json({ error: message }, { status: 403 });
      }
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器异常";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "未登录用户无法创建队伍" }, { status: 401 });
    }

    const body = await request.json();
    const result = createTeamSchema.safeParse(body);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "请求参数错误";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    try {
      const data = await createTeam({ roomId: result.data.roomId, name: result.data.name, userId: session.user.id });
      return NextResponse.json(data, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "创建队伍失败";
      if (message.includes("已加入")) {
        return NextResponse.json({ error: message }, { status: 409 });
      }
      if (message.includes("仅房间成员")) {
        return NextResponse.json({ error: message }, { status: 403 });
      }
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器异常";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
