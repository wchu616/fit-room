import { createSupabaseServiceRoleClient } from "@/lib/supabase";
import { Database } from "@/lib/types/database";

const CODE_LENGTH = 6;
const CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type SupabaseClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];
export type RoomInsert = Database["public"]["Tables"]["rooms"]["Insert"];
export type RoomMemberInsert = Database["public"]["Tables"]["room_members"]["Insert"];
export type RoomMemberRow = Database["public"]["Tables"]["room_members"]["Row"];
export type RoomWithJoinedAt = RoomRow & { joined_at: string };

type RoomMemberWithRoom = RoomMemberRow & { rooms: RoomRow | RoomRow[] | null };

export type RoomMemberWithUser = RoomMemberRow & {
  users: {
    id: string;
    username: string;
    display_name: string | null;
  } | null;
};

function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    const index = Math.floor(Math.random() * CODE_CHARSET.length);
    code += CODE_CHARSET[index];
  }
  return code;
}

async function ensureUniqueRoomCode(client: SupabaseClient): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateRoomCode();
    const { data: existing, error } = await client
      .from("rooms")
      .select("id")
      .eq("code", candidate)
      .maybeSingle<{ id: string }>();

    if (error) {
      throw new Error("检查房间码失败");
    }

    if (!existing) {
      return candidate;
    }
  }

  throw new Error("房间码生成失败，请稍后重试");
}

export async function createRoom({ name, ownerId }: { name: string; ownerId: string }) {
  const supabase = createSupabaseServiceRoleClient();
  const code = await ensureUniqueRoomCode(supabase);

  const insertPayload: RoomInsert = {
    name,
    code,
    owner_id: ownerId,
  };

  const { data: room, error } = await supabase
    .from("rooms")
    .insert(insertPayload)
    .select("id, name, code, owner_id, created_at")
    .maybeSingle<RoomRow>();

  if (error || !room) {
    throw new Error("房间创建失败");
  }

  const memberPayload: RoomMemberInsert = {
    room_id: room.id,
    user_id: ownerId,
  };

  const { error: memberError } = await supabase.from("room_members").insert(memberPayload);

  if (memberError) {
    throw new Error("房间成员关联失败");
  }

  return room;
}

export async function joinRoom({ code, userId }: { code: string; userId: string }) {
  const supabase = createSupabaseServiceRoleClient();

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, owner_id, name, code")
    .eq("code", code)
    .maybeSingle<RoomRow>();

  if (roomError) {
    throw new Error("查询房间失败");
  }

  if (!room) {
    throw new Error("房间不存在或房间码无效");
  }

  const { data: existingMember, error: memberCheckError } = await supabase
    .from("room_members")
    .select("id")
    .eq("room_id", room.id)
    .eq("user_id", userId)
    .maybeSingle<{ id: string }>();

  if (memberCheckError) {
    throw new Error("查询房间成员失败");
  }

  if (existingMember) {
    return room;
  }

  const payload: RoomMemberInsert = {
    room_id: room.id,
    user_id: userId,
  };

  const { error } = await supabase.from("room_members").insert(payload);

  if (error) {
    throw new Error("加入房间失败");
  }

  return room;
}

export async function leaveRoom({ roomId, userId }: { roomId: string; userId: string }) {
  const supabase = createSupabaseServiceRoleClient();

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, owner_id")
    .eq("id", roomId)
    .maybeSingle<RoomRow>();

  if (roomError) {
    throw new Error("查询房间失败");
  }

  if (!room) {
    throw new Error("房间不存在");
  }

  if (room.owner_id === userId) {
    const { data: members, error: membersError } = await supabase
      .from("room_members")
      .select("id")
      .eq("room_id", roomId);

    if (membersError) {
      throw new Error("查询房间成员失败");
    }

    if ((members?.length ?? 0) > 1) {
      throw new Error("请先转移房间拥有者或移除其他成员");
    }

    const { error: removeMembersError } = await supabase
      .from("room_members")
      .delete()
      .eq("room_id", roomId);

    if (removeMembersError) {
      throw new Error("清理房间成员失败");
    }

    const { error: removeRoomError } = await supabase
      .from("rooms")
      .delete()
      .eq("id", roomId);

    if (removeRoomError) {
      throw new Error("删除房间失败");
    }

    return { deletedRoom: true };
  }

  const { error } = await supabase
    .from("room_members")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", userId);

  if (error) {
    throw new Error("退出房间失败");
  }

  return { deletedRoom: false };
}

export async function listRoomsByUser(userId: string) {
  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from("room_members")
    .select(
      `
      id,
      room_id,
      user_id,
      joined_at,
      rooms ( id, name, code, owner_id, created_at )
    `
    )
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });

  if (error) {
    throw new Error("获取房间列表失败");
  }

  const memberships = (data ?? []) as RoomMemberWithRoom[];

  return memberships.flatMap((item) => {
    const roomData = Array.isArray(item.rooms) ? item.rooms[0] : item.rooms;

    if (!roomData) {
      return [];
    }

    return [
      {
        ...roomData,
        joined_at: item.joined_at ?? roomData.created_at ?? new Date().toISOString(),
      },
    ];
  });
}

export async function getRoomWithMembers({ roomId, userId }: { roomId: string; userId: string }) {
  const supabase = createSupabaseServiceRoleClient();

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, name, code, owner_id, created_at")
    .eq("id", roomId)
    .maybeSingle<RoomRow>();

  if (roomError) {
    throw new Error("查询房间失败");
  }

  if (!room) {
    throw new Error("房间不存在");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("room_members")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle<{ id: string }>();

  if (membershipError) {
    throw new Error("查询房间成员失败");
  }

  if (!membership) {
    throw new Error("无权访问该房间");
  }

  const { data: members, error: membersError } = await supabase
    .from("room_members")
    .select(
      `
      id,
      room_id,
      user_id,
      joined_at,
      users ( id, username, display_name )
    `
    )
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });

  if (membersError) {
    console.error("getRoomWithMembers: 获取成员列表失败", membersError);
    throw new Error(`获取成员列表失败: ${membersError.message ?? "未知错误"}`);
  }

  const normalizedMembers: RoomMemberWithUser[] = (members ?? []).map((member) => {
    const user = Array.isArray(member.users) ? member.users[0] ?? null : member.users;
    return {
      id: member.id,
      room_id: member.room_id,
      user_id: member.user_id,
      joined_at: member.joined_at,
      users: user,
    };
  });

  return {
    room,
    members: normalizedMembers,
  };
}

export async function removeRoomMember({
  roomId,
  targetUserId,
  actingUserId,
}: {
  roomId: string;
  targetUserId: string;
  actingUserId: string;
}) {
  const supabase = createSupabaseServiceRoleClient();

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, owner_id")
    .eq("id", roomId)
    .maybeSingle<RoomRow>();

  if (roomError) {
    throw new Error("查询房间失败");
  }

  if (!room) {
    throw new Error("房间不存在");
  }

  if (room.owner_id !== actingUserId) {
    throw new Error("只有房主可以移除成员");
  }

  if (targetUserId === actingUserId) {
    throw new Error("房主无法移除自己");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("room_members")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", targetUserId)
    .maybeSingle<{ id: string }>();

  if (membershipError) {
    throw new Error("查询成员信息失败");
  }

  if (!membership) {
    throw new Error("该用户不在房间中");
  }

  const { error: deleteError } = await supabase
    .from("room_members")
    .delete()
    .eq("id", membership.id);

  if (deleteError) {
    throw new Error("移除成员失败");
  }

  return { removed: true };
}
