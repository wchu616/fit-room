"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { loginSchema } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState({ username: "", password: "" });
  const redirectRef = useRef("/checkin");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    redirectRef.current = params.get("redirect") ?? "/checkin";
  }, []);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = { username: formData.get("username") ?? "", password: formData.get("password") ?? "" };

    const result = loginSchema.safeParse(payload);
    if (!result.success) {
      const fieldError = result.error.issues[0]?.message ?? "请输入有效信息";
      setError(fieldError);
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          body: JSON.stringify(result.data),
          headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
          const data = await response.json();
          setError(data.error ?? "登录失败，请重试");
          return;
        }

        window.location.href = redirectRef.current;
      } catch {
        setError("无法连接服务器，请稍后再试");
      }
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black/5 px-4 py-12">
      <div className="auth-container">
        <div className="space-y-2">
          <h1 className="auth-title">登录 Fit Rooms</h1>
          <p className="auth-description">使用用户名和密码登录，开始今日打卡之旅。</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            name="username"
            placeholder="用户名"
            value={values.username}
            onChange={(event) => setValues((prev) => ({ ...prev, username: event.target.value }))}
            required
          />
          <Input
            name="password"
            type="password"
            placeholder="密码"
            value={values.password}
            onChange={(event) => setValues((prev) => ({ ...prev, password: event.target.value }))}
            required
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" fullWidth disabled={pending}>
            {pending ? "登录中..." : "登录"}
          </Button>
        </form>

        <p className="auth-footer">
          还没有账号？<Link href="/signup" className="text-primary-600 hover:underline">立即注册</Link>
        </p>
      </div>
    </div>
  );
}
