import { NextResponse } from "next/server";
import { clearSessionCookie, getServerSession } from "@/lib/auth";

export async function POST() {
  try {
    const session = await getServerSession();
    if (session) {
      await clearSessionCookie();
    }
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("logout failed", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
