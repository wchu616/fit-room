import { createSupabaseServiceRoleClient } from "@/lib/supabase";
import { Database } from "@/lib/types/database";

const DATE_KEYS_HISTORY_LIMIT = 30;
const TEAM_HISTORY_LIMIT = 12;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function normalizeDateKey(date: string) {
  return `${date}T00:00:00Z`;
}

function diffInDays(prev: string, next: string) {
  const prevTime = new Date(normalizeDateKey(prev)).getTime();
  const nextTime = new Date(normalizeDateKey(next)).getTime();
  return Math.round((nextTime - prevTime) / DAY_IN_MS);
}

type SupabaseClient = ReturnType<typeof createSupabaseServiceRoleClient>;

type DailyStatRow = Pick<Database["public"]["Tables"]["daily_stats"]["Row"], "stat_date" | "did_checkin">;
type TeamRow = Pick<Database["public"]["Tables"]["teams"]["Row"], "id" | "name">;
type TeamScoreRow = Pick<Database["public"]["Tables"]["team_scores"]["Row"], "team_id" | "points" | "score_date" | "reason">;
type TeamStreakRow = Pick<Database["public"]["Tables"]["team_streaks"]["Row"], "start_date" | "end_date" | "length">;
type RoomRow = Pick<Database["public"]["Tables"]["rooms"]["Row"], "id" | "name" | "code">;

async function assertRoomMembership(client: SupabaseClient, roomId: string, userId: string) {
  const { data, error } = await client
    .from("room_members")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new Error("查询房间成员信息失败");
  }

  if (!data) {
    throw new Error("仅房间成员可查看统计");
  }
}

function buildPersonalStats(entries: DailyStatRow[]) {
  if (entries.length === 0) {
    return {
      totalDays: 0,
      completedDays: 0,
      missedDays: 0,
      completionRate: 0,
      recentCompletionRate: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastCheckinDate: null as string | null,
      firstTrackedDate: null as string | null,
      history: [] as Array<{ date: string; didCheckin: boolean }>,
    };
  }

  let completedDays = 0;
  let longestStreak = 0;
  let streakUpToCursor = 0;
  let lastCheckinDate: string | null = null;
  let firstTrackedDate: string | null = null;
  let previousEntry: DailyStatRow | null = null;

  entries.forEach((entry, index) => {
    if (index === 0) {
      firstTrackedDate = entry.stat_date;
    }

    if (entry.did_checkin) {
      completedDays += 1;
      lastCheckinDate = entry.stat_date;
      if (previousEntry && previousEntry.did_checkin && diffInDays(previousEntry.stat_date, entry.stat_date) === 1) {
        streakUpToCursor += 1;
      } else {
        streakUpToCursor = 1;
      }
    } else {
      streakUpToCursor = 0;
    }

    if (streakUpToCursor > longestStreak) {
      longestStreak = streakUpToCursor;
    }

    previousEntry = entry;
  });

  const totalDays = entries.length;
  const missedDays = totalDays - completedDays;
  const completionRate = totalDays > 0 ? completedDays / totalDays : 0;
  const currentStreak = entries[entries.length - 1]?.did_checkin ? streakUpToCursor : 0;

  const recentWindow = entries.slice(-7);
  const recentCompletionRate = recentWindow.length
    ? recentWindow.filter((item) => item.did_checkin).length / recentWindow.length
    : 0;

  const history = entries.slice(-DATE_KEYS_HISTORY_LIMIT).map((item) => ({
    date: item.stat_date,
    didCheckin: item.did_checkin,
  }));

  return {
    totalDays,
    completedDays,
    missedDays,
    completionRate,
    recentCompletionRate,
    currentStreak,
    longestStreak,
    lastCheckinDate,
    firstTrackedDate,
    history,
  };
}

function buildTeamReasonBreakdown(scores: TeamScoreRow[]) {
  const map = new Map<string, { totalPoints: number; occurrences: number }>();

  scores.forEach((score) => {
    const bucket = map.get(score.reason) ?? { totalPoints: 0, occurrences: 0 };
    bucket.totalPoints += score.points;
    bucket.occurrences += 1;
    map.set(score.reason, bucket);
  });

  return Array.from(map.entries())
    .map(([reason, value]) => ({ reason, ...value }))
    .sort((a, b) => b.totalPoints - a.totalPoints || b.occurrences - a.occurrences || a.reason.localeCompare(b.reason, "zh-Hans"));
}

function pickLongestStreak(streaks: TeamStreakRow[]) {
  if (streaks.length === 0) {
    return null;
  }

  return streaks.reduce((acc, streak) => {
    if (!acc) return streak;
    if (streak.length > acc.length) return streak;
    if (streak.length === acc.length && streak.end_date > acc.end_date) return streak;
    return acc;
  }, streaks[0]);
}

function pickCurrentStreak(streaks: TeamStreakRow[]) {
  if (streaks.length === 0) {
    return null;
  }

  return streaks.reduce((acc, streak) => {
    if (!acc) return streak;
    return streak.end_date > acc.end_date ? streak : acc;
  }, streaks[0]);
}

type TeamMembersCountRow = Pick<Database["public"]["Tables"]["team_members"]["Row"], "team_id">;

type TeamMemberDetailRow = {
  user_id: string;
  joined_at: string | null;
  users: { username: string; display_name: string | null } | { username: string; display_name: string | null }[] | null;
};

function buildScoreboard({
  teams,
  memberCounts,
  roomScores,
  userTeamId,
}: {
  teams: TeamRow[];
  memberCounts: TeamMembersCountRow[];
  roomScores: Array<Pick<TeamScoreRow, "team_id" | "points" | "score_date">>;
  userTeamId: string | null;
}) {
  const scoreboard = new Map<
    string,
    {
      teamId: string;
      teamName: string;
      totalPoints: number;
      pointsLast7Days: number;
      lastScoreDate: string | null;
      memberCount: number;
      isUserTeam: boolean;
    }
  >();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const sevenDaysThreshold = sevenDaysAgo.toISOString().slice(0, 10);

  teams.forEach((team) => {
    scoreboard.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      totalPoints: 0,
      pointsLast7Days: 0,
      lastScoreDate: null,
      memberCount: 0,
      isUserTeam: team.id === userTeamId,
    });
  });

  memberCounts.forEach((row) => {
    const entry = scoreboard.get(row.team_id);
    if (entry) {
      entry.memberCount += 1;
    }
  });

  roomScores.forEach((score) => {
    const entry = scoreboard.get(score.team_id);
    if (!entry) return;
    entry.totalPoints += score.points;
    if (!entry.lastScoreDate || score.score_date > entry.lastScoreDate) {
      entry.lastScoreDate = score.score_date;
    }
    if (score.score_date >= sevenDaysThreshold) {
      entry.pointsLast7Days += score.points;
    }
  });

  return Array.from(scoreboard.values()).sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.pointsLast7Days !== a.pointsLast7Days) return b.pointsLast7Days - a.pointsLast7Days;
    return a.teamName.localeCompare(b.teamName, "zh-Hans");
  });
}

export type PersonalStatsSummary = ReturnType<typeof buildPersonalStats>;

export type TeamStatsSummary = {
  teamId: string;
  teamName: string;
  members: Array<{ userId: string; username: string; displayName: string | null; joinedAt: string | null }>;
  totalPoints: number;
  pointsLast7Days: number;
  reasonBreakdown: Array<{ reason: string; totalPoints: number; occurrences: number }>;
  currentStreak: { length: number; startDate: string; endDate: string } | null;
  longestStreak: { length: number; startDate: string; endDate: string } | null;
  history: Array<{ date: string; points: number; reason: string }>;
};

export type ScoreboardEntry = ReturnType<typeof buildScoreboard>[number];

export type RoomStats = {
  room: RoomRow;
  personal: PersonalStatsSummary;
  team: TeamStatsSummary | null;
  scoreboard: ScoreboardEntry[];
};

export async function getRoomStats({ roomId, userId }: { roomId: string; userId: string }) {
  const supabase = createSupabaseServiceRoleClient();

  await assertRoomMembership(supabase, roomId, userId);

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, name, code")
    .eq("id", roomId)
    .maybeSingle<RoomRow>();

  if (roomError) {
    throw new Error("查询房间信息失败");
  }

  if (!room) {
    throw new Error("房间不存在");
  }

  const [dailyStatsResult, teamMembershipResult, teamsResult, roomScoresResult] = await Promise.all([
    supabase
      .from("daily_stats")
      .select("stat_date, did_checkin")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .order("stat_date", { ascending: true }),
    supabase
      .from("team_members")
      .select("team_id, teams!inner(id, name)")
      .eq("user_id", userId)
      .eq("teams.room_id", roomId)
      .maybeSingle<{ team_id: string; teams: TeamRow | TeamRow[] | null }>(),
    supabase
      .from("teams")
      .select("id, name")
      .eq("room_id", roomId),
    supabase
      .from("team_scores")
      .select("team_id, points, score_date")
      .eq("room_id", roomId)
      .order("score_date", { ascending: true }),
  ]);

  if (dailyStatsResult.error) {
    throw new Error("获取每日统计失败");
  }

  if (teamsResult.error) {
    throw new Error("获取队伍信息失败");
  }

  if (roomScoresResult.error) {
    throw new Error("获取队伍得分失败");
  }

  if (teamMembershipResult.error) {
    throw new Error("查询队伍成员关系失败");
  }

  const dailyStats = (dailyStatsResult.data ?? []) as DailyStatRow[];
  const teams = (teamsResult.data ?? []) as TeamRow[];
  const roomScores = (roomScoresResult.data ?? []) as Array<Pick<TeamScoreRow, "team_id" | "points" | "score_date">>;

  const personal = buildPersonalStats(dailyStats);

  let userTeamId: string | null = null;
  let userTeamName: string | null = null;

  if (teamMembershipResult.data) {
    const rawTeam = teamMembershipResult.data.teams;
    const normalizedTeam = Array.isArray(rawTeam) ? rawTeam[0] ?? null : rawTeam;
    if (normalizedTeam) {
      userTeamId = teamMembershipResult.data.team_id;
      userTeamName = normalizedTeam.name;
    }
  }

  const teamIds = teams.map((team) => team.id);

  const memberCountsResult = teamIds.length
    ? await supabase
        .from("team_members")
        .select("team_id")
        .in("team_id", teamIds)
      : { data: [] as TeamMembersCountRow[], error: null };

  if (memberCountsResult.error) {
    throw new Error("获取队伍成员数量失败");
  }

  const scoreboard = buildScoreboard({
    teams,
    memberCounts: (memberCountsResult.data ?? []) as TeamMembersCountRow[],
    roomScores,
    userTeamId,
  });

  let teamStats: TeamStatsSummary | null = null;

  if (userTeamId && userTeamName) {
    const [teamMembersResult, teamScoresResult, teamStreaksResult] = await Promise.all([
      supabase
        .from("team_members")
        .select("user_id, joined_at, users(username, display_name)")
        .eq("team_id", userTeamId)
        .order("joined_at", { ascending: true }),
      supabase
        .from("team_scores")
        .select("score_date, points, reason")
        .eq("team_id", userTeamId)
        .order("score_date", { ascending: true }),
      supabase
        .from("team_streaks")
        .select("start_date, end_date, length")
        .eq("team_id", userTeamId)
        .order("start_date", { ascending: true }),
    ]);

    if (teamMembersResult.error) {
      throw new Error("获取队伍成员详情失败");
    }

    if (teamScoresResult.error) {
      throw new Error("获取队伍得分详情失败");
    }

    if (teamStreaksResult.error) {
      throw new Error("获取队伍连胜记录失败");
    }

    const teamMembersRows = (teamMembersResult.data ?? []) as TeamMemberDetailRow[];
    const teamScoresRows = (teamScoresResult.data ?? []) as TeamScoreRow[];
    const teamStreakRows = (teamStreaksResult.data ?? []) as TeamStreakRow[];

    const members = teamMembersRows.map((row) => {
      const user = Array.isArray(row.users) ? row.users[0] ?? null : row.users;
      return {
        userId: row.user_id,
        username: user?.username ?? "",
        displayName: user?.display_name ?? null,
        joinedAt: row.joined_at ?? null,
      };
    });

    const reasonBreakdown = buildTeamReasonBreakdown(teamScoresRows);
    const history = [...teamScoresRows]
      .sort((a, b) => b.score_date.localeCompare(a.score_date))
      .slice(0, TEAM_HISTORY_LIMIT)
      .map((score) => ({ date: score.score_date, points: score.points, reason: score.reason }));

    const longestStreakRow = pickLongestStreak(teamStreakRows);
    const currentStreakRow = pickCurrentStreak(teamStreakRows);

    const pointsLast7DaysEntry = scoreboard.find((entry) => entry.teamId === userTeamId);

    teamStats = {
      teamId: userTeamId,
      teamName: userTeamName,
      members,
      totalPoints: teamScoresRows.reduce((acc, score) => acc + score.points, 0),
      pointsLast7Days: pointsLast7DaysEntry?.pointsLast7Days ?? 0,
      reasonBreakdown,
      currentStreak: currentStreakRow
        ? { length: currentStreakRow.length, startDate: currentStreakRow.start_date, endDate: currentStreakRow.end_date }
        : null,
      longestStreak: longestStreakRow
        ? { length: longestStreakRow.length, startDate: longestStreakRow.start_date, endDate: longestStreakRow.end_date }
        : null,
      history,
    };
  }

  return {
    room,
    personal,
    team: teamStats,
    scoreboard,
  } satisfies RoomStats;
}
