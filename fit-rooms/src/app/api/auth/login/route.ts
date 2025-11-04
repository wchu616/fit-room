import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation";
import { createSupabaseServiceRoleClient } from "@/lib/supabase";
import { signToken, setSessionCookie, verifyPassword } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = loginSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0]?.message ?? "请求参数错误" }, { status: 400 });
    }

    const { username, password } = result.data;

    const supabase = createSupabaseServiceRoleClient();

    const { data: user } = await supabase
      .from("users")
      .select("id, username, password_hash, display_name, timezone")
      .eq("username", username)
      .single();

    if (!user || !user.password_hash) {
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
    }

    const token = signToken({ userId: user.id, username: user.username });
    await setSessionCookie(token);

    const safeUser = {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      timezone: user.timezone,
    };

    return NextResponse.json({ token, user: safeUser });
  } catch {
    return NextResponse.json({ error: "服务器异常" }, { status: 500 });
  }
}
