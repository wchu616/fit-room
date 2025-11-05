"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { useCallback, useState } from "react";

const links = [
  { href: "/", label: "概览" },
  { href: "/rooms", label: "房间" },
  { href: "/plans", label: "计划" },
  { href: "/checkin", label: "打卡" },
  { href: "/team", label: "小队" },
  { href: "/stats", label: "统计" },
];

export function NavBar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);

  const handleLogout = useCallback(async () => {
    if (logoutPending) return;
    setLogoutPending(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        throw new Error("退出登录失败");
      }
    } catch (error) {
      console.error("logout failed", error);
    } finally {
      setLogoutPending(false);
      window.location.href = "/login";
    }
  }, [logoutPending]);

  return (
    <header className="border-b border-black/5 bg-white/80 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/" className="text-lg font-semibold">
          Fit Rooms
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition",
                  isActive
                    ? "bg-primary-500 text-white shadow"
                    : "text-black/70 hover:bg-black/5"
                )}
              >
                {link.label}
              </Link>
            );
          })}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleLogout}
            disabled={logoutPending}
          >
            {logoutPending ? "正在退出..." : "退出登录"}
          </Button>
        </div>

        <Button
          className="md:hidden"
          size="sm"
          variant="secondary"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
        >
          菜单
        </Button>
      </nav>

      {mobileOpen ? (
        <div id="mobile-menu" className="border-t border-black/5 md:hidden">
          <div className="space-y-2 px-6 py-3">
            {links.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "block rounded-md px-3 py-2 text-sm font-medium",
                    isActive ? "bg-primary-500 text-white" : "text-black hover:bg-black/5"
                  )}
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </Link>
              );
            })}
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              onClick={() => {
                setMobileOpen(false);
                handleLogout();
              }}
              disabled={logoutPending}
            >
              {logoutPending ? "正在退出..." : "退出登录"}
            </Button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
