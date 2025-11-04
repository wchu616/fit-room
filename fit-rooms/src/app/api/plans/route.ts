import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { createPlanSchema } from "@/lib/validation";
import { createPlan, listPlansByUser } from "@/lib/plans";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "未登录用户无法查询计划" }, { status: 401 });
    }

    const plans = await listPlansByUser({ userId: session.user.id });

    return NextResponse.json({ plans }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "查询计划失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "未登录用户无法创建计划" }, { status: 401 });
    }

    const payload = await request.json();
    const parsed = createPlanSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const plan = await createPlan({ userId: session.user.id, input: parsed.data });

    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建计划失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
