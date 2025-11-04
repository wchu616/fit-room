import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { createSupabaseServiceRoleClient } from "@/lib/supabase";
import { Database } from "@/lib/types/database";

type UsersTable = Database["public"]["Tables"]["users"];

type UserRow = UsersTable["Row"];

type JwtPayload = {
  userId: string;
  username: string;
};

const JWT_SECRET = process.env.JWT_SECRET!;
const SESSION_COOKIE = "fitrooms_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7d

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: JwtPayload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: SESSION_MAX_AGE });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  const expires = new Date(Date.now() + SESSION_MAX_AGE * 1000);

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    expires,
    path: "/",
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getServerSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) {
    await clearSessionCookie();
    return null;
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, username, display_name, timezone")
    .eq("id", payload.userId)
    .single<UserRow>();

  if (error || !data) {
    await clearSessionCookie();
    return null;
  }

  return {
    token,
    user: {
      id: data.id,
      username: data.username,
      display_name: data.display_name,
      timezone: data.timezone,
    },
  };
}
