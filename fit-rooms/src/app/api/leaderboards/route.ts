import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { getLeaderboardSnapshot } from "@/lib/leaderboards";

const CACHE_HEADER = "s-maxage=60, stale-while-revalidate=30";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  const session = await getServerSession();

  if (!session) {
    return NextResponse.json({ error: "未登录用户无法查看排行榜" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get("roomId");
  const rawDate = searchParams.get("date");

  if (!roomId) {
    return badRequest("缺少 roomId 参数");
  }

  if (rawDate !== null && rawDate.trim() === "") {
    return badRequest("date 参数不能为空字符串");
  }

  const date = rawDate ?? undefined;

  try {
    const snapshot = await getLeaderboardSnapshot({ roomId, userId: session.user.id, date });
    const defaulted = !date;
    return NextResponse.json(
      {
        snapshot,
        meta: {
          usedDate: snapshot.snapshotDate,
          defaultedDate: defaulted,
          note: defaulted ? "未提供 date，默认使用 UTC+8 前一自然日" : undefined,
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": CACHE_HEADER,
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器异常";

    if (message.includes("仅房间成员")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    if (message.includes("指定日期暂无排行榜快照")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    if (message.includes("date 参数格式")) {
      return badRequest(message);
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
