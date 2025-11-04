"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { signupSchema } from "@/lib/validation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const timezones = [
  "Asia/Shanghai",
  "America/New_York",
  "Europe/London",
];

export default function SignupPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState({ username: "", password: "", confirmPassword: "", timezone: "Asia/Shanghai" });

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      username: formData.get("username") ?? "",
      password: formData.get("password") ?? "",
      confirmPassword: formData.get("confirmPassword") ?? "",
      timezone: formData.get("timezone") ?? "Asia/Shanghai",
    };

    const result = signupSchema.safeParse(payload);
    if (!result.success) {
      const fieldError = result.error.issues[0]?.message ?? "请检查填写信息";
      setError(fieldError);
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/signup", {
          method: "POST",
          body: JSON.stringify(result.data),
          headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
          const data = await response.json();
          setError(data.error ?? "注册失败，请重试");
          return;
        }

        window.location.href = "/rooms";
      } catch {
        setError("无法连接服务器，请稍后再试");
      }
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black/5 px-4 py-12">
      <div className="auth-container">
        <div className="space-y-2">
          <h1 className="auth-title">注册 Fit Rooms</h1>
          <p className="auth-description">创建新账号，与队友一起坚持每日打卡。</p>
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
          <Input
            name="confirmPassword"
            type="password"
            placeholder="确认密码"
            value={values.confirmPassword}
            onChange={(event) => setValues((prev) => ({ ...prev, confirmPassword: event.target.value }))}
            required
          />
          <div className="space-y-1">
            <label className="text-sm text-black/60" htmlFor="timezone">
              时区
            </label>
            <select
              id="timezone"
              name="timezone"
              className="app-input h-10 bg白 px-3 text-sm"
              value={values.timezone}
              onChange={(event) => setValues((prev) => ({ ...prev, timezone: event.target.value }))}
            >
              {timezones.map((timezone) => (
                <option key={timezone} value={timezone}>
                  {timezone}
                </option>
              ))}
            </select>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" fullWidth disabled={pending}>
            {pending ? "注册中..." : "注册"}
          </Button>
        </form>

        <p className="auth-footer">
          已有账号？<Link href="/login" className="text-primary-600 hover:underline">现在登录</Link>
        </p>
      </div>
    </div>
  );
}
