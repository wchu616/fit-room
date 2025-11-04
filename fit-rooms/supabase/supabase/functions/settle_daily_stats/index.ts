import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PAGE_SIZE = 100;

interface QueryParams {
  date?: string | null;
  tz?: string | null;
  dryRun?: boolean;
}

interface PendingStat {
  user_id: string;
  room_id: string;
  stat_date: string;
  did_checkin: boolean;
}

interface AuthUserSummary {
  id: string;
}

interface AdminListUsersResponse {
  users: AuthUserSummary[];
  next_page_token?: string | null;
}

interface DbUserTimezone {
  id: string;
  timezone: string | null;
}

function parseDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parseBooleanFlag(value: string | null | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function computeStatDate({ tz, targetDate }: { tz: string; targetDate: Date }) {
  const locale = targetDate.toLocaleString("en-US", { timeZone: tz });
  const localDate = new Date(locale);
  const year = localDate.getFullYear();
  const month = localDate.getMonth();
  const day = localDate.getDate();
  const utcDate = new Date(Date.UTC(year, month, day));
  return utcDate.toISOString().slice(0, 10);
}

function isWindowReached({ tz, targetDate }: { tz: string; targetDate: Date }) {
  const locale = targetDate.toLocaleString("en-US", { timeZone: tz, hour12: false });
  const localDate = new Date(locale);
  return localDate.getHours() >= 23 && localDate.getMinutes() >= 59;
}

async function listAuthUsers({
  supabaseUrl,
  serviceKey,
  pageToken,
  perPage,
}: {
  supabaseUrl: string;
  serviceKey: string;
  pageToken: string | undefined;
  perPage: number;
}): Promise<AdminListUsersResponse> {
  const url = new URL("/auth/v1/users", supabaseUrl);
  url.searchParams.set("per_page", String(perPage));
  if (pageToken) {
    url.searchParams.set("next_page_token", pageToken);
  }

  const response = await fetch(url.toString(), {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`listUsers failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as AdminListUsersResponse;
  return {
    users: body.users ?? [],
    next_page_token: body.next_page_token ?? null,
  };
}

async function fetchUserTimezones({
  supabaseUrl,
  serviceKey,
  userIds,
}: {
  supabaseUrl: string;
  serviceKey: string;
  userIds: string[];
}) {
  if (userIds.length === 0) return [] as DbUserTimezone[];

  const url = new URL("/rest/v1/users", supabaseUrl);
  const filter = `(${userIds.join(",")})`;
  url.searchParams.set("id", `in.${filter}`);
  url.searchParams.set("select", "id,timezone");

  const response = await fetch(url.toString(), {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "count=estimated",
    },
  });

  if (!response.ok) {
    throw new Error(`fetch user timezone failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as DbUserTimezone[];
  return data ?? [];
}

async function fetchRoomMemberships({
  supabaseUrl,
  serviceKey,
  userId,
}: {
  supabaseUrl: string;
  serviceKey: string;
  userId: string;
}) {
  const url = new URL("/rest/v1/room_members", supabaseUrl);
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("select", "room_id");

  const response = await fetch(url.toString(), {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`fetch room memberships failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as Array<{ room_id: string }>;
  return data.map((row) => row.room_id);
}

async function fetchCheckinRooms({
  supabaseUrl,
  serviceKey,
  userId,
  statDate,
}: {
  supabaseUrl: string;
  serviceKey: string;
  userId: string;
  statDate: string;
}) {
  const url = new URL("/rest/v1/checkins", supabaseUrl);
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("for_date", `eq.${statDate}`);
  url.searchParams.set("select", "room_id");

  const response = await fetch(url.toString(), {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`fetch checkins failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as Array<{ room_id: string }>;
  return new Set(data.map((row) => row.room_id));
}

async function upsertDailyStats({
  supabaseUrl,
  serviceKey,
  stats,
}: {
  supabaseUrl: string;
  serviceKey: string;
  stats: PendingStat[];
}) {
  if (stats.length === 0) return;

  const url = new URL("/rest/v1/daily_stats", supabaseUrl);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation,resolution=merge-duplicates",
    },
    body: JSON.stringify(stats),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`upsert daily_stats failed: ${response.status} ${response.statusText} ${text}`);
  }
}

function buildDryRunResponse(stats: PendingStat[]) {
  return new Response(
    JSON.stringify({ dryRun: true, count: stats.length, stats }, null, 2),
    { headers: { "Content-Type": "application/json" } }
  );
}

function buildWriteResponse(stats: PendingStat[]) {
  return new Response(
    JSON.stringify({ dryRun: false, inserted: stats.length }, null, 2),
    { headers: { "Content-Type": "application/json" } }
  );
}

async function collectPendingStats({
  supabaseUrl,
  serviceKey,
  params,
  now,
}: {
  supabaseUrl: string;
  serviceKey: string;
  params: QueryParams;
  now: Date;
}) {
  const pending: PendingStat[] = [];
  let token: string | undefined;

  do {
    const { users, next_page_token } = await listAuthUsers({
      supabaseUrl,
      serviceKey,
      pageToken: token,
      perPage: PAGE_SIZE,
    });
    token = next_page_token ?? undefined;

    const userIds = users.map((user) => user.id);
    if (userIds.length === 0) {
      continue;
    }

    const timezoneRows = await fetchUserTimezones({ supabaseUrl, serviceKey, userIds });
    const timezoneMap = new Map<string, string>();
    timezoneRows.forEach((row) => {
      timezoneMap.set(row.id, row.timezone ?? "Asia/Shanghai");
    });

    for (const user of users) {
      const userTz = params.tz ?? timezoneMap.get(user.id) ?? "Asia/Shanghai";
      const windowReached = params.date ? true : isWindowReached({ tz: userTz, targetDate: now });
      if (!windowReached) continue;

      const statDate = params.date ?? computeStatDate({ tz: userTz, targetDate: now });
      const roomIds = await fetchRoomMemberships({ supabaseUrl, serviceKey, userId: user.id });
      if (roomIds.length === 0) continue;

      const checkinRooms = await fetchCheckinRooms({ supabaseUrl, serviceKey, userId: user.id, statDate });

      roomIds.forEach((roomId) => {
        pending.push({
          user_id: user.id,
          room_id: roomId,
          stat_date: statDate,
          did_checkin: checkinRooms.has(roomId),
        });
      });
    }
  } while (token);

  return pending;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const query = Object.fromEntries(url.searchParams.entries());

    const params: QueryParams = {
      date: parseDate(query.date ?? null),
      tz: query.tz ?? null,
      dryRun: parseBooleanFlag(query.dryRun ?? null),
    };

    if (params.date === null && query.date) {
      return new Response(JSON.stringify({ error: "date 参数格式应为 YYYY-MM-DD" }), { status: 400 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY" }), { status: 500 });
    }

    const now = params.date ? new Date(`${params.date}T23:59:00Z`) : new Date();
    const stats = await collectPendingStats({ supabaseUrl, serviceKey, params, now });

    if (params.dryRun) {
      return buildDryRunResponse(stats);
    }

    await upsertDailyStats({ supabaseUrl, serviceKey, stats });
    return buildWriteResponse(stats);
  } catch (error) {
    console.error("settle_daily_stats failed", error);
    return new Response(JSON.stringify({ error: (error as Error).message ?? "Internal error" }), { status: 500 });
  }
});
