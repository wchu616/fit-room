import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { getRoomStats } from "@/lib/stats";

export async function GET(request: Request) {
  const session = await getServerSession();

  if (!session) {
    return NextResponse.json({ error: "未登录用户无法查看统计" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get("roomId");

  if (!roomId) {
    return NextResponse.json({ error: "缺少 roomId 参数" }, { status: 400 });
  }

  try {
    const stats = await getRoomStats({ roomId, userId: session.user.id });
    return NextResponse.json({ stats }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器异常";

    if (message.includes("仅房间成员")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    if (message.includes("房间不存在")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
