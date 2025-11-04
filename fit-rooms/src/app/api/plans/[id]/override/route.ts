import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { planOverrideSchema } from "@/lib/validation";
import { createPlanOverride, PlanNotFoundError } from "@/lib/plans";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "未登录用户无法申请 override" }, { status: 401 });
    }

    const params = await context.params;
    const planId = params.id;

    if (!planId) {
      return NextResponse.json({ error: "缺少计划 ID" }, { status: 400 });
    }

    const payload = await request.json();
    const parsed = planOverrideSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await createPlanOverride({ planId, userId: session.user.id, input: parsed.data });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof PlanNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "申请 override 失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
