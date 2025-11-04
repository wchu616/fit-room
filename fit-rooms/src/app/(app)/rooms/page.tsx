import { listRoomsByUser } from "@/lib/rooms";
import { getServerSession } from "@/lib/auth";
import { RoomsShell } from "./rooms-shell";
import { redirect } from "next/navigation";

export default async function RoomsPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  const rooms = await listRoomsByUser(session.user.id);

  return <RoomsShell initialRooms={rooms} currentUserId={session.user.id} />;
}
