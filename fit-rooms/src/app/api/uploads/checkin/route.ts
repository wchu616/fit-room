import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { uploadCheckinImage } from "@/lib/storage";
import { listRoomsByUser } from "@/lib/rooms";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "未登录用户无法上传打卡照片" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const roomId = formData.get("roomId");

    if (!(file instanceof File) || typeof roomId !== "string" || roomId.length === 0) {
      return NextResponse.json({ error: "缺少文件或房间 ID" }, { status: 400 });
    }

    const rooms = await listRoomsByUser(session.user.id);
    const joinedRoomIds = new Set(rooms.map((room) => room.id));

    if (!joinedRoomIds.has(roomId)) {
      return NextResponse.json({ error: "仅房间成员可上传打卡照片" }, { status: 403 });
    }

    const result = await uploadCheckinImage({ roomId, userId: session.user.id, file });

    return NextResponse.json({ path: result.path }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
