import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { listRoomsByUser } from "@/lib/rooms";
import { uploadCheckinImage } from "@/lib/storage";
import { createCheckin, listUserCheckins } from "@/lib/checkins";

export const runtime = "nodejs";

function computeForDate(takenAt: Date) {
  const date = new Date(takenAt);
  return date.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "未登录用户无法获取打卡记录" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("roomId");
    const limitParam = searchParams.get("limit");

    if (!roomId) {
      return NextResponse.json({ error: "缺少房间 ID" }, { status: 400 });
    }

    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    if (limitParam && Number.isNaN(limit)) {
      return NextResponse.json({ error: "limit 参数无效" }, { status: 400 });
    }

    const checkins = await listUserCheckins({ roomId, userId: session.user.id, limit });

    return NextResponse.json({ checkins }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("仅房间成员")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "获取打卡记录失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "未登录用户无法打卡" }, { status: 401 });
    }

    const formData = await request.formData();
    const roomId = formData.get("roomId");
    const photoPath = formData.get("photoPath");
    const file = formData.get("file");

    if (typeof roomId !== "string" || roomId.length === 0) {
      return NextResponse.json({ error: "缺少房间 ID" }, { status: 400 });
    }

    const rooms = await listRoomsByUser(session.user.id);
    const joinedRoomIds = new Set(rooms.map((room) => room.id));

    if (!joinedRoomIds.has(roomId)) {
      return NextResponse.json({ error: "仅房间成员可打卡" }, { status: 403 });
    }

    let finalPhotoPath: string | null = null;

    if (file instanceof File) {
      const result = await uploadCheckinImage({ roomId, userId: session.user.id, file });
      finalPhotoPath = result.path;
    } else if (typeof photoPath === "string" && photoPath.startsWith(`checkins/${roomId}/${session.user.id}`)) {
      finalPhotoPath = photoPath;
    } else {
      return NextResponse.json({ error: "缺少打卡照片" }, { status: 400 });
    }

    const takenAt = new Date();
    const forDate = computeForDate(takenAt);

    const record = await createCheckin({
      roomId,
      userId: session.user.id,
      photoPath: finalPhotoPath,
      takenAt: takenAt.toISOString(),
      forDate,
    });

    return NextResponse.json({ forDate: record.for_date, takenAt: record.taken_at }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "打卡失败";
    if (message.includes("已打卡")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
