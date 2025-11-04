import { NextResponse } from "next/server";
import { joinRoomSchema } from "@/lib/validation";
import { joinRoom } from "@/lib/rooms";
import { getServerSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "未登录用户无法加入房间" }, { status: 401 });
    }

    const body = await request.json();
    const result = joinRoomSchema.safeParse(body);

    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "请求参数错误";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const room = await joinRoom({ code: result.data.code, userId: session.user.id });

    return NextResponse.json({ room }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器异常";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
