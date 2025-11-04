import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { listRoomsByUser } from "@/lib/rooms";
import { getRoomStats } from "@/lib/stats";
import { StatsShell } from "./stats-shell";

export default async function StatsPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login?redirect=/stats");
  }

  const rooms = await listRoomsByUser(session.user.id);
  const initialRoomId = rooms[0]?.id ?? null;
  const initialStats = initialRoomId ? await getRoomStats({ roomId: initialRoomId, userId: session.user.id }) : null;

  return <StatsShell rooms={rooms} initialRoomId={initialRoomId} initialStats={initialStats} />;
}
