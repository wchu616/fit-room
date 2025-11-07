import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { planOverrideSchema, updatePlanSchema } from "@/lib/validation";
import { deletePlan, PlanLockedError, PlanNotFoundError, updatePlan } from "@/lib/plans";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "未登录用户无法更新计划" }, { status: 401 });
    }

    const params = await context.params;
    const planId = params.id;
    if (!planId) {
      return NextResponse.json({ error: "缺少计划 ID" }, { status: 400 });
    }

    const payload = await request.json();
    const parsed = updatePlanSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const overridePayload = payload.override ? planOverrideSchema.safeParse(payload.override) : null;
    if (overridePayload && !overridePayload.success) {
      return NextResponse.json({ error: overridePayload.error.flatten() }, { status: 400 });
    }

    const plan = await updatePlan({
      planId,
      userId: session.user.id,
      input: parsed.data,
      overrideReason: overridePayload?.success ? overridePayload.data : undefined,
    });

    return NextResponse.json({ plan }, { status: 200 });
  } catch (error) {
    if (error instanceof PlanNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof PlanLockedError) {
      return NextResponse.json({ error: error.message }, { status: 423 });
    }
    const message = error instanceof Error ? error.message : "更新计划失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "未登录用户无法删除计划" }, { status: 401 });
    }

    const params = await context.params;
    const planId = params.id;

    if (!planId) {
      return NextResponse.json({ error: "缺少计划 ID" }, { status: 400 });
    }

    const payload = request.headers.get("content-type")?.includes("application/json")
      ? await request.json().catch(() => undefined)
      : undefined;
    const overridePayload = payload?.override ? planOverrideSchema.safeParse(payload.override) : null;
    if (overridePayload && !overridePayload.success) {
      return NextResponse.json({ error: overridePayload.error.flatten() }, { status: 400 });
    }

    await deletePlan({
      planId,
      userId: session.user.id,
      overrideReason: overridePayload?.success ? overridePayload.data : undefined,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof PlanNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof PlanLockedError) {
      return NextResponse.json({ error: error.message }, { status: 423 });
    }
    const message = error instanceof Error ? error.message : "删除计划失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
