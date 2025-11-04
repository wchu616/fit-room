import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PAGE_SIZE = 100;

interface SnapshotRequest {
  date?: string;
  dryRun?: boolean;
}

interface RoomRow {
  id: string;
  name: string;
}

interface TeamRow {
  id: string;
  name: string;
}

interface TeamScoreRow {
  team_id: string;
  points: number;
  score_date: string;
}

interface RankingEntry {
  team_id: string;
  team_name: string;
  member_count: number;
  total_points: number;
  points_last7_days: number;
  last_score_date: string | null;
}

interface LeaderboardRecord {
  room_id: string;
  snapshot_date: string;
  ranking: RankingEntry[];
}

function parseJsonBody(body: unknown): SnapshotRequest {
  if (!body || typeof body !== "object") {
    return {};
  }
  const value = body as Record<string, unknown>;
  return {
    date: typeof value.date === "string" ? value.date : undefined,
    dryRun: Boolean(value.dryRun),
  };
}

function parseDate(value: string | undefined): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function toISODate(date: Date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString().slice(0, 10);
}

function computeDefaultSnapshotDate(now: Date) {
  const shanghaiNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  shanghaiNow.setDate(shanghaiNow.getDate() - 1);
  return toISODate(shanghaiNow);
}

function dateFromISO(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
}

function subtractDays(date: Date, days: number) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() - days);
  return copy;
}

async function fetchRooms({
  supabaseUrl,
  serviceKey,
}: {
  supabaseUrl: string;
  serviceKey: string;
}): Promise<RoomRow[]> {
  const rooms: RoomRow[] = [];
  let offset = 0;

  while (true) {
    const url = new URL("/rest/v1/rooms", supabaseUrl);
    url.searchParams.set("select", "id,name");
    url.searchParams.set("order", "created_at.asc");
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url.toString(), {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`fetch rooms failed: ${response.status} ${response.statusText}`);
    }

    const batch = (await response.json()) as RoomRow[];
    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    rooms.push(...batch);
    if (batch.length < PAGE_SIZE) {
      break;
    }
    offset += PAGE_SIZE;
  }

  return rooms;
}

async function fetchTeams({
  supabaseUrl,
  serviceKey,
  roomId,
}: {
  supabaseUrl: string;
  serviceKey: string;
  roomId: string;
}): Promise<TeamRow[]> {
  const url = new URL("/rest/v1/teams", supabaseUrl);
  url.searchParams.set("room_id", `eq.${roomId}`);
  url.searchParams.set("select", "id,name");
  url.searchParams.set("order", "created_at.asc");

  const response = await fetch(url.toString(), {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`fetch teams failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as TeamRow[];
  return Array.isArray(data) ? data : [];
}

async function fetchTeamScores({
  supabaseUrl,
  serviceKey,
  roomId,
  snapshotDate,
}: {
  supabaseUrl: string;
  serviceKey: string;
  roomId: string;
  snapshotDate: string;
}): Promise<TeamScoreRow[]> {
  const scores: TeamScoreRow[] = [];
  let offset = 0;

  while (true) {
    const url = new URL("/rest/v1/team_scores", supabaseUrl);
    url.searchParams.set("room_id", `eq.${roomId}`);
    url.searchParams.set("score_date", `lte.${snapshotDate}`);
    url.searchParams.set("select", "team_id,points,score_date");
    url.searchParams.set("order", "score_date.asc");
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url.toString(), {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`fetch team_scores failed: ${response.status} ${response.statusText}`);
    }

    const batch = (await response.json()) as TeamScoreRow[];
    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    scores.push(...batch);
    if (batch.length < PAGE_SIZE) {
      break;
    }
    offset += PAGE_SIZE;
  }

  return scores;
}

async function fetchMemberCounts({
  supabaseUrl,
  serviceKey,
  teamIds,
}: {
  supabaseUrl: string;
  serviceKey: string;
  teamIds: string[];
}): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (teamIds.length === 0) return counts;

  const step = 50;
  for (let i = 0; i < teamIds.length; i += step) {
    const chunk = teamIds.slice(i, i + step);
    const url = new URL("/rest/v1/team_members", supabaseUrl);
    url.searchParams.set("team_id", `in.(${chunk.join(",")})`);
    url.searchParams.set("select", "team_id");

    const response = await fetch(url.toString(), {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`fetch team_members failed: ${response.status} ${response.statusText}`);
    }

    const rows = (await response.json()) as Array<{ team_id: string }>;
    rows.forEach((row) => {
      counts.set(row.team_id, (counts.get(row.team_id) ?? 0) + 1);
    });
  }

  return counts;
}

function buildRanking({
  teams,
  scores,
  memberCounts,
  snapshotDate,
}: {
  teams: TeamRow[];
  scores: TeamScoreRow[];
  memberCounts: Map<string, number>;
  snapshotDate: string;
}): RankingEntry[] {
  const totalPoints = new Map<string, number>();
  const last7Points = new Map<string, number>();
  const lastScoreDate = new Map<string, string>();

  const snapshot = dateFromISO(snapshotDate);
  const sevenDayStart = toISODate(subtractDays(snapshot, 6));

  scores.forEach((score) => {
    const prevTotal = totalPoints.get(score.team_id) ?? 0;
    totalPoints.set(score.team_id, prevTotal + score.points);

    if (score.score_date >= sevenDayStart) {
      const prevLast7 = last7Points.get(score.team_id) ?? 0;
      last7Points.set(score.team_id, prevLast7 + score.points);
    }

    const prevLastDate = lastScoreDate.get(score.team_id);
    if (!prevLastDate || prevLastDate < score.score_date) {
      lastScoreDate.set(score.team_id, score.score_date);
    }
  });

  const ranking: RankingEntry[] = teams.map((team) => {
    const total = totalPoints.get(team.id) ?? 0;
    const last7 = last7Points.get(team.id) ?? 0;
    const memberCount = memberCounts.get(team.id) ?? 0;
    const lastDate = lastScoreDate.get(team.id) ?? null;

    return {
      team_id: team.id,
      team_name: team.name,
      member_count: memberCount,
      total_points: total,
      points_last7_days: last7,
      last_score_date: lastDate,
    };
  });

  ranking.sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    if (b.points_last7_days !== a.points_last7_days) return b.points_last7_days - a.points_last7_days;
    return a.team_name.localeCompare(b.team_name, "zh-Hans");
  });

  return ranking;
}

async function upsertLeaderboards({
  supabaseUrl,
  serviceKey,
  records,
}: {
  supabaseUrl: string;
  serviceKey: string;
  records: LeaderboardRecord[];
}) {
  if (records.length === 0) return;

  const url = new URL("/rest/v1/leaderboards", supabaseUrl);
  url.searchParams.set("on_conflict", "room_id,snapshot_date");

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation,resolution=merge-duplicates",
    },
    body: JSON.stringify(records),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`upsert leaderboards failed: ${response.status} ${response.statusText} ${text}`);
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY" }), { status: 500 });
    }

    const payload = parseJsonBody(await req.json().catch(() => ({})));
    const parsedDate = parseDate(payload.date);

    if (payload.date && !parsedDate) {
      return new Response(JSON.stringify({ error: "date 参数格式应为 YYYY-MM-DD" }), { status: 400 });
    }

    const now = new Date();
    const snapshotDate = parsedDate ?? computeDefaultSnapshotDate(now);

    const rooms = await fetchRooms({ supabaseUrl, serviceKey });

    const records: LeaderboardRecord[] = [];
    const dryRunDetails: Array<{ room_id: string; ranking: RankingEntry[] }> = [];

    for (const room of rooms) {
      const teams = await fetchTeams({ supabaseUrl, serviceKey, roomId: room.id });
      if (teams.length === 0) {
        continue;
      }

      const scores = await fetchTeamScores({ supabaseUrl, serviceKey, roomId: room.id, snapshotDate });
      const teamIds = teams.map((team) => team.id);
      const memberCounts = await fetchMemberCounts({ supabaseUrl, serviceKey, teamIds });
      const ranking = buildRanking({ teams, scores, memberCounts, snapshotDate });

      if (ranking.length === 0) {
        continue;
      }

      const record: LeaderboardRecord = {
        room_id: room.id,
        snapshot_date: snapshotDate,
        ranking,
      };

      if (payload.dryRun) {
        dryRunDetails.push({ room_id: room.id, ranking });
      } else {
        records.push(record);
      }
    }

    if (payload.dryRun) {
      return new Response(
        JSON.stringify(
          {
            dryRun: true,
            snapshotDate,
            roomsProcessed: dryRunDetails.length,
            rooms: dryRunDetails,
          },
          null,
          2
        ),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    await upsertLeaderboards({ supabaseUrl, serviceKey, records });

    return new Response(
      JSON.stringify(
        {
          dryRun: false,
          snapshotDate,
          upserted: records.length,
        },
        null,
        2
      ),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("build_leaderboard_snapshot failed", error);
    return new Response(JSON.stringify({ error: (error as Error).message ?? "Internal error" }), { status: 500 });
  }
});
