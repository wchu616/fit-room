"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addMonths, endOfMonth, endOfWeek, format, isSameMonth, isToday, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { rrulestr } from "rrule";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { PlanOverrideInput } from "@/lib/validation";

interface PlanOverride {
  id: string;
  reason: "period" | "weather" | "other";
  for_date: string;
  created_at: string | null;
  user_id: string;
  note: string | null;
}

interface Plan {
  id: string;
  title: string;
  details: Record<string, unknown> | null;
  start_date: string;
  end_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  overrides: PlanOverride[];
}

interface PlansResponse {
  plans: Array<Plan & { overrides?: PlanOverride[] | null }>;
}

interface DayPlan {
  id: string;
  title: string;
  dateKey: string;
  plan: Plan;
}

interface EditState {
  plan: Plan;
  dateKey: string;
  override?: PlanOverrideInput;
}

interface OverrideReasonState {
  plan: Plan;
  dateKey: string;
}

interface DeleteOverrideState {
  planId: string;
  dateKey: string;
}

const WEEK_DAYS = ["日", "一", "二", "三", "四", "五", "六"];

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function buildVisibleDays(anchor: Date) {
  const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(anchor), { weekStartsOn: 0 });
  const days: Date[] = [];
  let cursor = start;
  while (cursor <= end) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

function expandPlanOccurrences(plan: Plan, visibleStart: Date, visibleEnd: Date): DayPlan[] {
  const occurrences: DayPlan[] = [];
  const planStart = parseISO(plan.start_date);
  const planEnd = plan.end_date ? parseISO(plan.end_date) : visibleEnd;
  const within = (date: Date) => date >= visibleStart && date <= visibleEnd && date >= planStart && date <= planEnd;
  const toKey = (date: Date) => format(date, "yyyy-MM-dd");

  const rruleString = typeof plan.details?.rrule === "string" ? plan.details.rrule : null;
  if (rruleString) {
    try {
      const rule = rrulestr(rruleString, { dtstart: planStart });
      const dates = rule.between(visibleStart, visibleEnd, true);
      dates.forEach((date) => {
        if (within(date)) {
          occurrences.push({ id: `${plan.id}-${toKey(date)}`, title: plan.title, dateKey: toKey(date), plan });
        }
      });
      return occurrences;
    } catch (error) {
      console.error("RRULE 解析失败", error);
    }
  }

  let cursor = planStart;
  while (within(cursor)) {
    if (cursor >= visibleStart) {
      occurrences.push({ id: `${plan.id}-${toKey(cursor)}`, title: plan.title, dateKey: toKey(cursor), plan });
    }
    cursor = addDays(cursor, 1);
  }

  return occurrences;
}

function buildPlanInstances(plans: Plan[], visibleStart: Date, visibleEnd: Date) {
  const map = new Map<string, DayPlan[]>();

  plans.forEach((plan) => {
    const instances = expandPlanOccurrences(plan, visibleStart, visibleEnd);
    instances.forEach((instance) => {
      const list = map.get(instance.dateKey) ?? [];
      list.push(instance);
      map.set(instance.dateKey, list);
    });
  });

  map.forEach((list) => list.sort((a, b) => a.title.localeCompare(b.title, "zh-Hans")));

  return map;
}

function buildLockInstant(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 10, 0, 0, 0);
}

function extractRrule(details: Record<string, unknown> | null): string {
  if (details && typeof details.rrule === "string") {
    return details.rrule;
  }
  return "";
}

function formatOverrideLabel(reason: PlanOverride["reason"]) {
  switch (reason) {
    case "period":
      return "生理期";
    case "weather":
      return "天气";
    default:
      return "其他";
  }
}

function formatOverrideTimestamp(override: PlanOverride) {
  if (override.created_at) {
    return format(parseISO(override.created_at), "yyyy-MM-dd HH:mm");
  }
  return `${override.for_date} 10:00`;
}

type RecurrenceMode = "none" | "weekly" | "dailyInterval" | "custom";

type PlanFormState = {
  title: string;
  startDate: string;
  endDate: string;
  recurrenceMode: RecurrenceMode;
  weeklyDays: string[];
  interval: number;
  customRrule: string;
};

type PlanFormSubmit = {
  title: string;
  startDate: string;
  endDate: string;
  rrule: string;
};

const WEEKDAY_OPTIONS = [
  { code: "MO", label: "周一" },
  { code: "TU", label: "周二" },
  { code: "WE", label: "周三" },
  { code: "TH", label: "周四" },
  { code: "FR", label: "周五" },
  { code: "SA", label: "周六" },
  { code: "SU", label: "周日" },
];

function parseRruleToFormState(rrule: string): Pick<PlanFormState, "recurrenceMode" | "weeklyDays" | "interval" | "customRrule"> {
  const normalized = rrule.trim();
  if (!normalized) {
    return { recurrenceMode: "none", weeklyDays: [], interval: 1, customRrule: "" };
  }
  const upper = normalized.toUpperCase();
  if (upper.startsWith("FREQ=WEEKLY")) {
    const match = upper.match(/BYDAY=([^;]+)/);
    const days = match ? match[1].split(",").map((day) => day.trim()).filter(Boolean) : [];
    return { recurrenceMode: "weekly", weeklyDays: days, interval: 1, customRrule: "" };
  }
  if (upper.startsWith("FREQ=DAILY")) {
    const match = upper.match(/INTERVAL=(\d+)/);
    const interval = match ? Math.max(1, parseInt(match[1], 10) || 1) : 1;
    return { recurrenceMode: "dailyInterval", weeklyDays: [], interval, customRrule: "" };
  }
  return { recurrenceMode: "custom", weeklyDays: [], interval: 1, customRrule: normalized };
}

function buildRruleFromState(state: PlanFormState): { rrule: string; error?: string } {
  switch (state.recurrenceMode) {
    case "none":
      return { rrule: "" };
    case "weekly": {
      if (state.weeklyDays.length === 0) {
        return { rrule: "", error: "请选择至少一个重复日" };
      }
      const uniqueDays = Array.from(new Set(state.weeklyDays));
      return { rrule: `FREQ=WEEKLY;BYDAY=${uniqueDays.join(",")}` };
    }
    case "dailyInterval": {
      const interval = Math.max(1, Math.floor(state.interval) || 1);
      return interval === 1 ? { rrule: "FREQ=DAILY" } : { rrule: `FREQ=DAILY;INTERVAL=${interval}` };
    }
    case "custom": {
      const trimmed = state.customRrule.trim();
      if (!trimmed) {
        return { rrule: "", error: "请输入自定义重复规则" };
      }
      return { rrule: trimmed };
    }
    default:
      return { rrule: "" };
  }
}

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activeDate, setActiveDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [collectOverride, setCollectOverride] = useState<OverrideReasonState | null>(null);
  const [deleteState, setDeleteState] = useState<DeleteOverrideState | null>(null);
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>({});

  const monthStart = useMemo(() => startOfMonth(activeDate), [activeDate]);
  const monthEnd = useMemo(() => endOfMonth(activeDate), [activeDate]);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/plans", { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/login?redirect=/plans";
        return;
      }
      if (!response.ok) {
        throw new Error((await response.json().catch(() => ({}))).error ?? "获取计划失败");
      }
      const data = (await response.json()) as PlansResponse;
      const normalized = (data.plans ?? []).map((plan) => {
        const overrides = [...(plan.overrides ?? [])].sort((a, b) => {
          const aTime = a.created_at ?? `${a.for_date}T00:00:00`;
          const bTime = b.created_at ?? `${b.for_date}T00:00:00`;
          return bTime.localeCompare(aTime);
        });
        return {
          ...plan,
          overrides,
        };
      });
      setPlans(normalized);
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取计划失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPlans();
  }, [fetchPlans]);

  const visibleDays = useMemo(() => buildVisibleDays(activeDate), [activeDate]);

  const plansByDate = useMemo(() => {
    const visibleStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const visibleEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return buildPlanInstances(plans, visibleStart, visibleEnd);
  }, [plans, monthStart, monthEnd]);

  const selectedPlans = plansByDate.get(selectedDate) ?? [];

  const editInitialState = useMemo(() => {
    if (!editState) return null;
    const recurrence = parseRruleToFormState(extractRrule(editState.plan.details));
    return {
      title: editState.plan.title,
      startDate: editState.plan.start_date,
      endDate: editState.plan.end_date ?? "",
      recurrenceMode: recurrence.recurrenceMode,
      weeklyDays: recurrence.weeklyDays,
      interval: recurrence.interval,
      customRrule: recurrence.customRrule,
    } satisfies PlanFormState;
  }, [editState]);

  function isLockedForDate(dateKey: string) {
    const lockInstant = buildLockInstant(dateKey);
    return new Date() >= lockInstant;
  }

  async function extractErrorMessage(response: Response, fallback: string) {
    const payload = await response.json().catch(() => null);
    if (payload) {
      if (typeof payload.error === "string") return payload.error;
      if (payload.error?.message) return payload.error.message;
    }
    return fallback;
  }

  async function handleCreateSubmit(values: PlanFormSubmit) {
    const body = {
      title: values.title.trim(),
      start_date: values.startDate,
      end_date: values.endDate ? values.endDate : null,
      details: values.rrule ? { rrule: values.rrule.trim() } : null,
    };

    const response = await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(await extractErrorMessage(response, "创建计划失败"));
    }

    setSelectedDate(values.startDate);
    await fetchPlans();
  }

  async function handleUpdateSubmit(values: PlanFormSubmit, override?: PlanOverrideInput) {
    if (!editState) return;

    const body: Record<string, unknown> = {
      title: values.title.trim(),
      start_date: values.startDate,
      end_date: values.endDate ? values.endDate : null,
      details: values.rrule ? { rrule: values.rrule.trim() } : null,
    };

    if (override) {
      body.override = override;
    }

    const response = await fetch(`/api/plans/${editState.plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const message = await extractErrorMessage(
        response,
        response.status === 423 ? "今日 10:00 后需 override 后再编辑" : "更新计划失败"
      );
      throw new Error(message);
    }

    await fetchPlans();
  }

  async function handleDelete(planId: string, dateKey: string, locked: boolean) {
    if (locked) {
      setDeleteState({ planId, dateKey });
      return;
    }

    const response = await fetch(`/api/plans/${planId}`, {
      method: "DELETE",
    });

    if (response.status !== 204) {
      throw new Error(await extractErrorMessage(response, "删除计划失败"));
    }

    await fetchPlans();
  }

  function toggleOverrideHistory(planId: string) {
    setExpandedOverrides((prev) => ({
      ...prev,
      [planId]: !prev[planId],
    }));
  }

  function openEdit(plan: Plan, dateKey: string) {
    const locked = isLockedForDate(dateKey);
    if (locked) {
      setCollectOverride({ plan, dateKey });
      return;
    }
    setEditState({ plan, dateKey });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">计划日历</h1>
          <p className="text-sm text-black/60">查看训练安排，10:00 后可申请 override。</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>创建计划</Button>
      </div>

      <Card padded>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => setActiveDate(addMonths(activeDate, -1))}>
              上个月
            </Button>
            <div className="text-lg font-semibold">{format(activeDate, "yyyy 年 MM 月")}</div>
            <Button variant="secondary" size="sm" onClick={() => setActiveDate(addMonths(activeDate, 1))}>
              下个月
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => setActiveDate(new Date())}>
              回到今天
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void fetchPlans()} disabled={loading}>
              {loading ? "刷新中..." : "刷新计划"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
          <div className="grid grid-cols-7 text-center text-sm font-medium text-black/70">
            {WEEK_DAYS.map((day) => (
              <div key={day} className="py-2">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {visibleDays.map((date) => {
              const dateKey = format(date, "yyyy-MM-dd");
              const entries = plansByDate.get(dateKey) ?? [];
              const isCurrentMonth = isSameMonth(date, activeDate);
              const isSelected = selectedDate === dateKey;
              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => setSelectedDate(dateKey)}
                  className={`flex h-28 flex-col rounded-lg border p-2 text-left transition ${
                    isSelected
                      ? "border-primary-500 bg-primary-50"
                      : isCurrentMonth
                      ? "border-black/10 bg-white hover:border-primary-300"
                      : "border-black/5 bg-black/5 text-black/40"
                  }`}
                >
                  <div className={`flex items-center justify-between text-xs font-semibold ${isToday(date) ? "text-primary-600" : ""}`}>
                    <span>{format(date, "d")}</span>
                    {isToday(date) ? <Badge variant="info">今日</Badge> : null}
                  </div>
                  <div className="mt-2 space-y-1 overflow-hidden text-xs">
                    {entries.slice(0, 3).map((entry) => (
                      <div key={entry.id} className="truncate rounded bg-primary-100 px-2 py-1 text-primary-700" title={entry.title}>
                        {entry.title}
                      </div>
                    ))}
                    {entries.length > 3 ? <div className="text-[10px] text-black/50">+{entries.length - 3} 更多</div> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card padded>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>当日计划{selectedDate}</span>
            <Badge variant="default">计划 {selectedPlans.length} 条</Badge>
          </CardTitle>
          <CardDescription>点击日期查看当日计划，10:00 后需申请 override。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedPlans.length === 0 ? (
            <div className="rounded-md border border-black/10 bg-black/5 p-4 text-sm text-black/60">该日暂无计划。</div>
          ) : (
            selectedPlans.map((entry) => {
              const plan = entry.plan;
              const locked = isLockedForDate(entry.dateKey);
              const overrides = plan.overrides ?? [];
              const expanded = expandedOverrides[plan.id] ?? false;
              return (
                <div key={entry.id} className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="font-medium text-base">{plan.title}</div>
                      <div className="text-xs text-black/50">开始：{plan.start_date}{plan.end_date ? ` · 结束：${plan.end_date}` : ""}</div>
                      {extractRrule(plan.details) ? (
                        <div className="text-xs text-black/50">RRULE：{extractRrule(plan.details)}</div>
                      ) : null}
                      {locked ? <Badge variant="warning">今日 10:00 后已锁定</Badge> : <Badge variant="info">可编辑</Badge>}
                      {overrides.length > 0 ? (
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => toggleOverrideHistory(plan.id)}
                            className="text-xs text-primary-600 underline-offset-2 hover:underline"
                          >
                            {expanded ? "收起 override 历史" : `查看 override 历史 (${overrides.length})`}
                          </button>
                          {expanded ? (
                            <ul className="space-y-1 text-xs text-black/60">
                              {overrides.map((override) => (
                                <li key={override.id} className="rounded bg-black/5 px-2 py-1">
                                  <div className="font-medium">{formatOverrideLabel(override.reason)}</div>
                                  <div className="mt-1 text-xs text-black/60">
                                    <span>日期：{override.for_date}</span>
                                    <span className="ml-2">记录时间：{formatOverrideTimestamp(override)}</span>
                                  </div>
                                  {override.note ? (
                                    <div className="mt-1 text-xs text-black/70">说明：{override.note}</div>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openEdit(plan, entry.dateKey)}>
                        {locked ? "申请 override 编辑" : "编辑"}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => void handleDelete(plan.id, entry.dateKey, locked).catch((err: Error) => alert(err.message))}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {createOpen ? (
        <PlanFormDialog
          mode="create"
          open={createOpen}
          locked={false}
          initialState={{
            title: "",
            startDate: selectedDate,
            endDate: "",
            recurrenceMode: "none",
            weeklyDays: [],
            interval: 1,
            customRrule: "",
          }}
          onClose={() => setCreateOpen(false)}
          onSubmit={async (values) => {
            await handleCreateSubmit(values);
            setCreateOpen(false);
          }}
        />
      ) : null}

      {editState && editInitialState ? (
        <PlanFormDialog
          mode="edit"
          open={Boolean(editState)}
          locked={isLockedForDate(editState.dateKey)}
          overrideReason={editState.override}
          initialState={editInitialState}
          onClose={() => setEditState(null)}
          onSubmit={async (values) => {
            await handleUpdateSubmit(values, editState.override);
            setEditState(null);
          }}
        />
      ) : null}

      {collectOverride ? (
        <OverrideReasonDialog
          state={collectOverride}
          onClose={() => setCollectOverride(null)}
          onConfirm={(input) => {
            setCollectOverride(null);
            setEditState({ plan: collectOverride.plan, dateKey: collectOverride.dateKey, override: input });
          }}
        />
      ) : null}

      {deleteState ? (
        <DeleteOverrideDialog
          planId={deleteState.planId}
          dateKey={deleteState.dateKey}
          onClose={() => setDeleteState(null)}
          onSuccess={async () => {
            setDeleteState(null);
            await fetchPlans();
          }}
        />
      ) : null}
    </div>
  );
}

interface PlanFormDialogProps {
  mode: "create" | "edit";
  open: boolean;
  locked: boolean;
  initialState: PlanFormState;
  overrideReason?: PlanOverrideInput;
  onClose: () => void;
  onSubmit: (values: PlanFormSubmit) => Promise<void>;
}

function PlanFormDialog({ mode, open, locked, initialState, overrideReason, onClose, onSubmit }: PlanFormDialogProps) {
  const [values, setValues] = useState<PlanFormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues(initialState);
      setError(null);
      setSubmitting(false);
    }
  }, [initialState, open]);

  const canEdit = !locked || Boolean(overrideReason);

  const handleRecurrenceModeChange = (mode: RecurrenceMode) => {
    setValues((prev: PlanFormState) => {
      if (mode === "weekly") {
        const dayOrder = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
        const startDayIndex = new Date(prev.startDate).getDay();
        const defaultDay = dayOrder[startDayIndex] ?? "MO";
        const nextDays = prev.weeklyDays.length > 0 ? prev.weeklyDays : [defaultDay];
        return { ...prev, recurrenceMode: mode, weeklyDays: nextDays };
      }
      if (mode === "dailyInterval") {
        return { ...prev, recurrenceMode: mode, interval: prev.interval && prev.interval >= 1 ? prev.interval : 1 };
      }
      return { ...prev, recurrenceMode: mode };
    });
  };

  const toggleWeeklyDay = (code: string) => {
    setValues((prev: PlanFormState) => {
      const exists = prev.weeklyDays.includes(code);
      const nextDays = exists
        ? prev.weeklyDays.filter((day) => day !== code)
        : [...prev.weeklyDays, code];
      const sorted = nextDays
        .slice()
        .sort(
          (a, b) => WEEKDAY_OPTIONS.findIndex((opt) => opt.code === a) - WEEKDAY_OPTIONS.findIndex((opt) => opt.code === b)
        );
      return { ...prev, weeklyDays: sorted };
    });
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) {
      setError("今日 10:00 后请先申请 override");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { rrule, error: recurrenceError } = buildRruleFromState(values);
      if (recurrenceError) {
        setError(recurrenceError);
        setSubmitting(false);
        return;
      }
      await onSubmit({
        title: values.title,
        startDate: values.startDate,
        endDate: values.endDate,
        rrule,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  return open ? (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-xl rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold">{mode === "create" ? "创建计划" : "编辑计划"}</h2>
        <p className="mt-1 text-sm text-black/60">
          {mode === "create" ? "填写计划信息，后续可在日历中查看。" : "更新计划内容，10:00 后需 override 原因。"}
        </p>
        {locked ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            今日 10:00 后计划已锁定。
            {overrideReason ? (
              <span>
                本次 override 原因：{formatOverrideLabel(overrideReason.reason)}
                {overrideReason.note ? <span>（说明：{overrideReason.note}）</span> : null}。
              </span>
            ) : (
              "请先申请 override 后再编辑。"
            )}
          </div>
        ) : null}
        <div className="mt-4 space-y-4">
          <label className="block text-sm font-medium text-black/70">
            计划标题
            <input
              type="text"
              required
              value={values.title}
              onChange={(event) => setValues((prev: PlanFormState) => ({ ...prev, title: event.target.value }))}
              className="mt-1 w-full rounded border border-black/20 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
              disabled={submitting || !canEdit}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-black/70">
              开始日期
              <input
                type="date"
                required
                value={values.startDate}
                onChange={(event) => setValues((prev: PlanFormState) => ({ ...prev, startDate: event.target.value }))}
                className="mt-1 w-full rounded border border-black/20 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                disabled={submitting || !canEdit}
              />
            </label>
            <label className="block text-sm font-medium text-black/70">
              结束日期
              <input
                type="date"
                value={values.endDate}
                onChange={(event) => setValues((prev: PlanFormState) => ({ ...prev, endDate: event.target.value }))}
                className="mt-1 w-full rounded border border-black/20 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                disabled={submitting || !canEdit}
                min={values.startDate}
              />
            </label>
          </div>
          <div className="space-y-2">
            <span className="block text-sm font-medium text-black/70">重复</span>
            <div className="flex flex-wrap gap-2 text-sm">
              {(
                [
                  { key: "none" as RecurrenceMode, label: "不重复" },
                  { key: "weekly" as RecurrenceMode, label: "每周重复" },
                  { key: "dailyInterval" as RecurrenceMode, label: "每 N 天重复" },
                  { key: "custom" as RecurrenceMode, label: "自定义" },
                ]
              ).map((option) => {
                const active = values.recurrenceMode === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    className={`rounded-full border px-3 py-1 ${
                      active ? "border-primary-500 bg-primary-50 text-primary-600" : "border-black/20 bg-white hover:border-primary-300"
                    }`}
                    onClick={() => handleRecurrenceModeChange(option.key)}
                    disabled={submitting || !canEdit}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {values.recurrenceMode === "weekly" ? (
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_OPTIONS.map((day) => {
                  const active = values.weeklyDays.includes(day.code);
                  return (
                    <button
                      key={day.code}
                      type="button"
                      className={`rounded-full border px-3 py-1 text-sm ${
                        active ? "border-primary-500 bg-primary-50 text-primary-600" : "border-black/20 bg-white hover:border-primary-300"
                      }`}
                      onClick={() => toggleWeeklyDay(day.code)}
                      disabled={submitting || !canEdit}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {values.recurrenceMode === "dailyInterval" ? (
              <label className="flex items-center gap-2 text-sm text-black/70">
                <span>每</span>
                <input
                  type="number"
                  min={1}
                  value={values.interval}
                  onChange={(event) =>
                    setValues((prev: PlanFormState) => ({ ...prev, interval: Number(event.target.value) || 1 }))
                  }
                  className="w-20 rounded border border-black/20 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none"
                  disabled={submitting || !canEdit}
                />
                <span>天重复</span>
              </label>
            ) : null}
            {values.recurrenceMode === "custom" ? (
              <label className="block text-sm font-medium text-black/70">
                自定义 RRULE
                <textarea
                  placeholder="例如：FREQ=WEEKLY;BYDAY=MO,WE,FR"
                  value={values.customRrule}
                  onChange={(event) =>
                    setValues((prev: PlanFormState) => ({ ...prev, customRrule: event.target.value }))
                  }
                  className="mt-1 w-full rounded border border-black/20 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                  rows={2}
                  disabled={submitting || !canEdit}
                />
              </label>
            ) : null}
          </div>
        </div>
        {error ? <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button type="submit" disabled={submitting || (locked && !overrideReason)}>
            {submitting ? "提交中..." : mode === "create" ? "创建" : "保存"}
          </Button>
        </div>
      </form>
    </div>
  ) : null;
}

function OverrideReasonDialog({ state, onClose, onConfirm }: { state: OverrideReasonState; onClose: () => void; onConfirm: (input: PlanOverrideInput) => void }) {
  const [reason, setReason] = useState<PlanOverrideInput["reason"]>("period");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleReasonChange = (value: PlanOverrideInput["reason"]) => {
    setReason(value);
    setError(null);
    if (value !== "other") {
      setNote("");
    }
  };

  function handleConfirm() {
    if (reason === "other" && !note.trim()) {
      setError("选择“其他”时需要填写 override 说明");
      return;
    }
    setError(null);
    onConfirm({ reason, forDate: state.dateKey, note: reason === "other" ? note.trim() : undefined });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold">申请 override</h2>
        <p className="mt-1 text-sm text-black/60">选择 override 原因，确认后即可编辑该计划。</p>
        <div className="mt-4 space-y-3 text-sm">
          {[
            { key: "period", label: "生理期" },
            { key: "weather", label: "天气" },
            { key: "other", label: "其他" },
          ].map((item) => (
            <label key={item.key} className={`flex cursor-pointer items-center justify-between rounded border p-3 ${reason === item.key ? "border-primary-500 bg-primary-50" : "border-black/10 hover:border-primary-300"}`}>
              <span>{item.label}</span>
              <input
                type="radio"
                name="override-edit"
                value={item.key}
                checked={reason === item.key}
                onChange={() => handleReasonChange(item.key as PlanOverrideInput["reason"])}
              />
            </label>
          ))}
        </div>
        {reason === "other" ? (
          <label className="mt-4 block text-sm text-black/70">
            <span className="mb-1 block font-medium">说明</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="w-full rounded border border-black/20 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
              rows={3}
            />
          </label>
        ) : null}
        {error ? <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div> : null}
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleConfirm}>确认 override</Button>
        </div>
      </div>
    </div>
  );
}

function DeleteOverrideDialog({ planId, dateKey, onClose, onSuccess }: { planId: string; dateKey: string; onClose: () => void; onSuccess: () => Promise<void> }) {
  const [reason, setReason] = useState<PlanOverrideInput["reason"]>("period");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReasonChange = (value: PlanOverrideInput["reason"]) => {
    setReason(value);
    setError(null);
    if (value !== "other") {
      setNote("");
    }
  };

  async function handleSubmit() {
    if (reason === "other" && !note.trim()) {
      setError("选择“其他”时需要填写删除说明");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/plans/${planId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ override: { reason, forDate: dateKey, note: reason === "other" ? note.trim() : undefined } }),
      });

      if (response.status !== 204) {
        const payload = await response.json().catch(() => null);
        if (payload) {
          throw new Error(payload.error ?? "删除计划失败");
        }
        throw new Error("删除计划失败");
      }

      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除计划失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold">申请 override 删除计划</h2>
        <p className="mt-1 text-sm text-black/60">今日 10:00 后删除计划需要提供 override 原因。</p>
        <div className="mt-4 space-y-3 text-sm">
          {[
            { key: "period", label: "生理期" },
            { key: "weather", label: "天气" },
            { key: "other", label: "其他" },
          ].map((item) => (
            <label key={item.key} className={`flex cursor-pointer items-center justify-between rounded border p-3 ${reason === item.key ? "border-primary-500 bg-primary-50" : "border-black/10 hover:border-primary-300"}`}>
              <span>{item.label}</span>
              <input
                type="radio"
                name="override-delete"
                value={item.key}
                checked={reason === item.key}
                onChange={() => handleReasonChange(item.key as PlanOverrideInput["reason"])}
              />
            </label>
          ))}
        </div>
        {reason === "other" ? (
          <label className="mt-4 block text-sm text-black/70">
            <span className="mb-1 block font-medium">说明</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="w-full rounded border border-black/20 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
              rows={3}
            />
          </label>
        ) : null}
        {error ? <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div> : null}
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "提交中..." : "确认删除"}
          </Button>
        </div>
      </div>
    </div>
  );
}
