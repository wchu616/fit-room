import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { getRoomWithMembers } from "@/lib/rooms";
import { roomIdParamSchema } from "@/lib/validation";
import { RoomHeader } from "./components/RoomHeader";
import { MemberList } from "./components/MemberList";

interface RoomDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function RoomDetailPage({ params }: RoomDetailPageProps) {
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  const resolvedParams = await params;
  const parsed = roomIdParamSchema.safeParse(resolvedParams);
  if (!parsed.success) {
    notFound();
  }

  const roomId = parsed.data.id;

  try {
    const data = await getRoomWithMembers({ roomId, userId: session.user.id });

    return (
      <div className="space-y-6">
        <RoomHeader room={data.room} />
        <MemberList room={data.room} members={data.members} currentUserId={session.user.id} />
      </div>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法获取房间详情";

    if (message.includes("无权访问")) {
      redirect("/rooms");
    }

    if (message.includes("不存在")) {
      notFound();
    }

    throw error;
  }
}
