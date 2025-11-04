import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { listRoomsByUser } from "@/lib/rooms";
import { listTeamsByRoom, type TeamWithMembers } from "@/lib/teams";
import { TeamShell } from "./TeamShell";

export default async function TeamPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  const rooms = await listRoomsByUser(session.user.id);
  const initialRoomId = rooms[0]?.id ?? null;
  let initialTeams: TeamWithMembers[] = [];

  if (initialRoomId) {
    initialTeams = await listTeamsByRoom({ roomId: initialRoomId, userId: session.user.id });
  }

  return (
    <div className="space-y-6">
      <TeamShell rooms={rooms} initialRoomId={initialRoomId} initialTeams={initialTeams} />
    </div>
  );
}
