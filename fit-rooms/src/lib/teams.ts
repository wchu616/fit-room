import { createSupabaseServiceRoleClient } from "@/lib/supabase";
import { Database } from "@/lib/types/database";

export type TeamRow = Database["public"]["Tables"]["teams"]["Row"];
export type TeamMemberRow = Database["public"]["Tables"]["team_members"]["Row"];
export type CheckinRow = Database["public"]["Tables"]["checkins"]["Row"];

export type TeamMemberInfo = {
  user_id: string;
  joined_at: string | null;
  display_name: string | null;
  username: string;
  hasCheckedInToday: boolean;
};

export type TeamWithMembers = TeamRow & {
  members: TeamMemberInfo[];
  memberCount: number;
  isMember: boolean;
  completedCount: number;
};

type SupabaseClient = ReturnType<typeof createSupabaseServiceRoleClient>;

async function assertRoomMembership(supabase: SupabaseClient, roomId: string, userId: string) {
  const { data, error } = await supabase
    .from("room_members")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new Error("查询房间成员信息失败");
  }

  if (!data) {
    throw new Error("仅房间成员可执行此操作");
  }
}

async function assertNotInTeamInRoom(supabase: SupabaseClient, roomId: string, userId: string) {
  const { data, error } = await supabase
    .from("team_members")
    .select(
      `
      id,
      teams!inner ( id, room_id )
    `
    )
    .eq("user_id", userId)
    .eq("teams.room_id", roomId)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new Error("检查队伍成员信息失败");
  }

  if (data) {
    throw new Error("你已加入该房间的某个队伍");
  }
}

function buildTeamList(
  teams: TeamRow[],
  members: Array<
    TeamMemberRow & {
      users: { username: string; display_name: string | null } | { username: string; display_name: string | null }[] | null;
    }
  >,
  currentUserId: string,
  checkedInUserIds: Set<string>
): TeamWithMembers[] {
  const memberMap = new Map<string, TeamMemberInfo[]>();

  members.forEach((member) => {
    const user = Array.isArray(member.users) ? member.users[0] : member.users;
    const list = memberMap.get(member.team_id) ?? [];
    list.push({
      user_id: member.user_id,
      joined_at: member.joined_at,
      display_name: user?.display_name ?? null,
      username: user?.username ?? "",
      hasCheckedInToday: checkedInUserIds.has(member.user_id),
    });
    memberMap.set(member.team_id, list);
  });

  return teams.map((team) => {
    const memberList = memberMap.get(team.id) ?? [];
    const isMember = memberList.some((m) => m.user_id === currentUserId);
    const completedCount = memberList.filter((m) => m.hasCheckedInToday).length;
    return {
      ...team,
      members: memberList,
      memberCount: memberList.length,
      isMember,
      completedCount,
    };
  });
}

export async function listTeamsByRoom({ roomId, userId }: { roomId: string; userId: string }) {
  const supabase = createSupabaseServiceRoleClient();

  await assertRoomMembership(supabase, roomId, userId);

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, name, room_id, created_by, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });

  if (teamsError) {
    throw new Error("获取队伍列表失败");
  }

  if (!teams || teams.length === 0) {
    return [] as TeamWithMembers[];
  }

  const teamIds = teams.map((team) => team.id);

  const { data: members, error: membersError } = await supabase
    .from("team_members")
    .select(
      `
      id,
      team_id,
      user_id,
      joined_at,
      users ( username, display_name )
    `
    )
    .in("team_id", teamIds)
    .order("joined_at", { ascending: true });

  if (membersError) {
    throw new Error("获取队伍成员失败");
  }

  const todayDate = new Date().toISOString().slice(0, 10);

  const { data: checkins, error: checkinsError } = await supabase
    .from("checkins")
    .select("user_id")
    .eq("room_id", roomId)
    .eq("for_date", todayDate);

  if (checkinsError) {
    throw new Error("获取队伍今日打卡状态失败");
  }

  const checkedInUserIds = new Set((checkins ?? []).map((row) => row.user_id));

  return buildTeamList(teams, members ?? [], userId, checkedInUserIds);
}

export async function createTeam({ roomId, name, userId }: { roomId: string; name: string; userId: string }) {
  const supabase = createSupabaseServiceRoleClient();

  await assertRoomMembership(supabase, roomId, userId);
  await assertNotInTeamInRoom(supabase, roomId, userId);

  const { data: team, error: teamError } = await supabase
    .from("teams")
    .insert({ room_id: roomId, name, created_by: userId })
    .select("id, name, room_id, created_by, created_at")
    .maybeSingle<TeamRow>();

  if (teamError || !team) {
    throw new Error("创建队伍失败");
  }

  const { error: memberError } = await supabase
    .from("team_members")
    .insert({ team_id: team.id, user_id: userId });

  if (memberError) {
    throw new Error("将创建者加入队伍失败");
  }

  return { teamId: team.id };
}

export async function joinTeam({ teamId, userId }: { teamId: string; userId: string }) {
  const supabase = createSupabaseServiceRoleClient();

  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("id, room_id")
    .eq("id", teamId)
    .maybeSingle<Pick<TeamRow, "id" | "room_id">>();

  if (teamError) {
    throw new Error("查询队伍失败");
  }

  if (!team) {
    throw new Error("队伍不存在");
  }

  await assertRoomMembership(supabase, team.room_id, userId);
  await assertNotInTeamInRoom(supabase, team.room_id, userId);

  const { count, error: countError } = await supabase
    .from("team_members")
    .select("id", { head: true, count: "exact" })
    .eq("team_id", teamId);

  if (countError) {
    throw new Error("查询队伍人数失败");
  }

  if ((count ?? 0) >= 3) {
    throw new Error("队伍人数已满，最多 3 人");
  }

  const { error: insertError } = await supabase
    .from("team_members")
    .insert({ team_id: teamId, user_id: userId });

  if (insertError) {
    throw new Error("加入队伍失败");
  }

  return { joined: true };
}

export async function leaveTeam({ teamId, userId }: { teamId: string; userId: string }) {
  const supabase = createSupabaseServiceRoleClient();

  const { data: membership, error: membershipError } = await supabase
    .from("team_members")
    .select(
      `
      id,
      team_id,
      teams!inner ( room_id )
    `
    )
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle<{ id: string; teams: { room_id: string } | { room_id: string }[] }>();

  if (membershipError) {
    throw new Error("查询队伍成员失败");
  }

  if (!membership) {
    throw new Error("你不在该队伍中");
  }

  const roomId = Array.isArray(membership.teams) ? membership.teams[0]?.room_id : membership.teams?.room_id;

  if (!roomId) {
    throw new Error("队伍所属房间异常");
  }

  await assertRoomMembership(supabase, roomId, userId);

  const { error: removeError } = await supabase
    .from("team_members")
    .delete()
    .eq("id", membership.id);

  if (removeError) {
    throw new Error("退出队伍失败");
  }

  const { count, error: remainingError } = await supabase
    .from("team_members")
    .select("id", { head: true, count: "exact" })
    .eq("team_id", teamId);

  if (remainingError) {
    throw new Error("查询队伍剩余成员失败");
  }

  let deletedTeam = false;

  if ((count ?? 0) === 0) {
    const { error: deleteTeamError } = await supabase
      .from("teams")
      .delete()
      .eq("id", teamId);

    if (deleteTeamError) {
      throw new Error("删除空队伍失败");
    }

    deletedTeam = true;
  }

  return { left: true, deletedTeam };
}
