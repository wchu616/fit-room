import { NextResponse } from "next/server";
import { createRoomSchema } from "@/lib/validation";
import { createRoom, listRoomsByUser } from "@/lib/rooms";
import { getServerSession } from "@/lib/auth";

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

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "未登录用户无法创建房间" }, { status: 401 });
    }

    const body = await request.json();
    const result = createRoomSchema.safeParse(body);

    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "请求参数错误";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const room = await createRoom({ name: result.data.name, ownerId: session.user.id });

    return NextResponse.json({ room }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器异常";

    if (message.includes("未登录")) {
      return NextResponse.json({ error: message }, { status: 401 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
