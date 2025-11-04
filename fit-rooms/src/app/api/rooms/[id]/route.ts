import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { getRoomWithMembers } from "@/lib/rooms";
import { roomIdParamSchema } from "@/lib/validation";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "未登录用户无法获取房间详情" }, { status: 401 });
    }

    const params = await context.params;
    const parseResult = roomIdParamSchema.safeParse(params);
    if (!parseResult.success) {
      const message = parseResult.error.issues[0]?.message ?? "房间 ID 无效";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    try {
      const data = await getRoomWithMembers({ roomId: parseResult.data.id, userId: session.user.id });
      return NextResponse.json(data, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "获取房间详情失败";
      if (message.includes("无权访问")) {
        return NextResponse.json({ error: message }, { status: 403 });
      }
      if (message.includes("不存在")) {
        return NextResponse.json({ error: message }, { status: 404 });
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器异常";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
