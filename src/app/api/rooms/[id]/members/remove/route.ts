import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { removeRoomMember } from "@/lib/rooms";
import { removeRoomMemberSchema, roomIdParamSchema } from "@/lib/validation";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "未登录用户无法移除成员" }, { status: 401 });
    }

    const params = await context.params;
    const paramsResult = roomIdParamSchema.safeParse(params);
    if (!paramsResult.success) {
      const message = paramsResult.error.issues[0]?.message ?? "房间 ID 无效";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const body = await request.json();
    const bodyResult = removeRoomMemberSchema.safeParse(body);
    if (!bodyResult.success) {
      const message = bodyResult.error.issues[0]?.message ?? "请求参数错误";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    try {
      const result = await removeRoomMember({
        roomId: paramsResult.data.id,
        targetUserId: bodyResult.data.userId,
        actingUserId: session.user.id,
      });

      return NextResponse.json(result, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "移除成员失败";
      if (message.includes("房主")) {
        return NextResponse.json({ error: message }, { status: 403 });
      }
      if (message.includes("不存在")) {
        return NextResponse.json({ error: message }, { status: 404 });
      }
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器异常";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
