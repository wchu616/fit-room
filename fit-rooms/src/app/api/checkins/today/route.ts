import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { getTodayCheckin } from "@/lib/checkins";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "未登录用户无法获取打卡状态" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("roomId");

    if (!roomId) {
      return NextResponse.json({ error: "缺少房间 ID" }, { status: 400 });
    }

    const checkin = await getTodayCheckin({ roomId, userId: session.user.id });

    return NextResponse.json({ checkin }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("仅房间成员")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "获取打卡状态失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
