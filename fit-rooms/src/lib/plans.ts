import { createSupabaseServiceRoleClient } from "@/lib/supabase";
import { Database, Json } from "@/lib/types/database";
import { CreatePlanInput, PlanOverrideInput, UpdatePlanInput } from "@/lib/validation";

export type PlanRow = Database["public"]["Tables"]["plans"]["Row"];
export type PlanInsert = Database["public"]["Tables"]["plans"]["Insert"];
export type PlanUpdate = Database["public"]["Tables"]["plans"]["Update"];
export type PlanOverrideRow = Database["public"]["Tables"]["plan_overrides"]["Row"];
export type PlanOverrideInsert = Database["public"]["Tables"]["plan_overrides"]["Insert"];
export type PlanWithOverrides = PlanRow & { overrides: PlanOverrideRow[] };

export class PlanNotFoundError extends Error {
  constructor() {
    super("计划不存在或无权访问");
    this.name = "PlanNotFoundError";
  }
}

export class PlanLockedError extends Error {
  constructor() {
    super("计划已锁定，请申请 override");
    this.name = "PlanLockedError";
  }
}

function normalizeDetails(details: unknown | undefined): Json | null | undefined {
  if (details === undefined) return undefined;
  if (details === null) return null;
  if (typeof details === "string" || typeof details === "number" || typeof details === "boolean") {
    return details;
  }
  if (Array.isArray(details)) {
    return details as Json[];
  }
  if (typeof details === "object") {
    return details as { [key: string]: Json | undefined };
  }
  return null;
}

function buildLockInstant(planDate: string, timezone: string) {
  const startOfDay = new Date(new Date(`${planDate}T00:00:00`).toLocaleString("en-US", { timeZone: timezone }));
  startOfDay.setHours(10, 0, 0, 0);
  return startOfDay;
}

async function fetchUserTimezone(userId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("users")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle<{ timezone: string }>();

  if (error || !data?.timezone) {
    return "Asia/Shanghai"; // 默认回退
  }

  return data.timezone;
}

async function assertPlanOwnership({ planId, userId }: { planId: string; userId: string }) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("plans")
    .select("id, user_id, title, details, start_date, end_date, created_at, updated_at")
    .eq("id", planId)
    .maybeSingle<PlanRow>();

  if (error) {
    throw new Error(error.message ?? "查询计划失败");
  }

  if (!data || data.user_id !== userId) {
    throw new PlanNotFoundError();
  }

  return data;
}

async function ensurePlanNotLocked({ plan, userId, forDate }: { plan: PlanRow; userId: string; forDate?: string }) {
  const timezone = await fetchUserTimezone(userId);
  const targetDate = forDate ?? plan.start_date;
  const lockInstant = buildLockInstant(targetDate, timezone);
  const now = new Date();
  if (now >= lockInstant) {
    throw new PlanLockedError();
  }
}

async function recordPlanOverride({
  planId,
  userId,
  reason,
  forDate,
}: {
  planId: string;
  userId: string;
  reason: PlanOverrideInput["reason"];
  forDate: string;
}) {
  const supabase = createSupabaseServiceRoleClient();
  const payload: PlanOverrideInsert = {
    plan_id: planId,
    user_id: userId,
    reason,
    for_date: forDate,
  };

  const { error } = await supabase.from("plan_overrides").insert(payload);

  if (error) {
    throw new Error(error.message ?? "记录 override 失败");
  }
}

export async function listPlansByUser({ userId }: { userId: string }): Promise<PlanWithOverrides[]> {
  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from("plans")
    .select(
      `
      id,
      user_id,
      title,
      details,
      start_date,
      end_date,
      created_at,
      updated_at,
      plan_overrides ( id, reason, for_date, created_at, user_id )
    `
    )
    .eq("user_id", userId)
    .order("start_date", { ascending: false });

  if (error) {
    throw new Error(error.message ?? "查询计划失败");
  }

  return ((data ?? []) as Array<PlanRow & { plan_overrides: PlanOverrideRow[] | null }>).map(({ plan_overrides, ...plan }) => ({
    ...plan,
    overrides: plan_overrides ?? [],
  }));
}

export async function createPlan({ userId, input }: { userId: string; input: CreatePlanInput }) {
  const supabase = createSupabaseServiceRoleClient();

  const payload: PlanInsert = {
    user_id: userId,
    title: input.title,
    details: normalizeDetails(input.details) ?? null,
    start_date: input.start_date,
    end_date: input.end_date ?? null,
  };

  const { data, error } = await supabase
    .from("plans")
    .insert(payload)
    .select("id, user_id, title, details, start_date, end_date, created_at, updated_at")
    .maybeSingle<PlanRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "创建计划失败");
  }

  return data;
}

export async function updatePlan({
  planId,
  userId,
  input,
  overrideReason,
}: {
  planId: string;
  userId: string;
  input: UpdatePlanInput;
  overrideReason?: PlanOverrideInput;
}) {
  const plan = await assertPlanOwnership({ planId, userId });

  if (!overrideReason) {
    await ensurePlanNotLocked({ plan, userId });
  }

  const supabase = createSupabaseServiceRoleClient();

  const payload: PlanUpdate = {
    title: input.title,
    details: input.details === undefined ? undefined : normalizeDetails(input.details) ?? null,
    start_date: input.start_date,
    end_date: input.end_date ?? null,
  };

  const { data, error } = await supabase
    .from("plans")
    .update(payload)
    .eq("id", planId)
    .select("id, user_id, title, details, start_date, end_date, created_at, updated_at")
    .maybeSingle<PlanRow>();

  if (error) {
    throw new Error(error.message ?? "更新计划失败");
  }

  if (!data) {
    throw new PlanNotFoundError();
  }

  if (overrideReason) {
    await recordPlanOverride({ planId, userId, reason: overrideReason.reason, forDate: overrideReason.forDate ?? plan.start_date });
  }

  return data;
}

export async function deletePlan({ planId, userId, overrideReason }: { planId: string; userId: string; overrideReason?: PlanOverrideInput }) {
  const plan = await assertPlanOwnership({ planId, userId });

  if (!overrideReason) {
    await ensurePlanNotLocked({ plan, userId });
  }

  const supabase = createSupabaseServiceRoleClient();

  const { error } = await supabase.from("plans").delete().eq("id", planId);

  if (error) {
    throw new Error(error.message ?? "删除计划失败");
  }

  if (overrideReason) {
    await recordPlanOverride({ planId, userId, reason: overrideReason.reason, forDate: overrideReason.forDate ?? plan.start_date });
  }
}

export async function createPlanOverride({
  planId,
  userId,
  input,
}: {
  planId: string;
  userId: string;
  input: PlanOverrideInput;
}) {
  const plan = await assertPlanOwnership({ planId, userId });
  const forDate = input.forDate ?? plan.start_date;
  await recordPlanOverride({ planId, userId, reason: input.reason, forDate });
}
