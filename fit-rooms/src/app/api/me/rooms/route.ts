import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { listRoomsByUser } from "@/lib/rooms";

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "未登录用户无法获取房间" }, { status: 401 });
    }

    const rooms = await listRoomsByUser(session.user.id);
    return NextResponse.json({ rooms }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器异常";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
