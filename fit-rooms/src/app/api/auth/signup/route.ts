import { NextResponse } from "next/server";
import { signupSchema } from "@/lib/validation";
import { createSupabaseServiceRoleClient } from "@/lib/supabase";
import { hashPassword, setSessionCookie, signToken } from "@/lib/auth";
import { Database } from "@/lib/types/database";

const DEFAULT_TIMEZONE = "Asia/Shanghai";

type UsersTable = Database["public"]["Tables"]["users"];
type UserRow = UsersTable["Row"];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = signupSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0]?.message ?? "请求参数错误" }, { status: 400 });
    }

    const { username, password, timezone } = result.data;
    const supabase = createSupabaseServiceRoleClient();

    const { data: existingUser, error: existingError } = await supabase
      .from("users")
      .select("id")
      .eq("username", username)
      .maybeSingle<{ id: UserRow["id"] }>();

    if (existingError) {
      console.error("/api/auth/signup existing user check failed", existingError);
      return NextResponse.json({ error: "服务器异常" }, { status: 500 });
    }

    if (existingUser) {
      return NextResponse.json({ error: "用户名已被占用" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const { data: user, error: insertError } = await supabase
      .from("users")
      .insert({
        username,
        password_hash: passwordHash,
        timezone: timezone ?? DEFAULT_TIMEZONE,
      })
      .select("id, username, display_name, timezone")
      .single<UserRow>();

    if (insertError || !user) {
      return NextResponse.json({ error: "注册失败，请稍后重试" }, { status: 500 });
    }

    const token = signToken({ userId: user.id, username: user.username });
    await setSessionCookie(token);

    return NextResponse.json(
      {
        token,
        user: {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          timezone: user.timezone,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("/api/auth/signup failed", error);
    return NextResponse.json({ error: "服务器异常" }, { status: 500 });
  }
}
