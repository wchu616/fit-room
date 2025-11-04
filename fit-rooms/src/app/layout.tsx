import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ReactNode } from "react";
import "./globals.css";
import { NavBar } from "@/components/NavBar";
import { Container } from "@/components/Container";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fit Rooms",
  description: "Room/team based fitness check-in app",
};

function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <NavBar />
      <Container className="flex-1 pb-12">{children}</Container>
      <footer className="border-t border-black/5 bg-white/80">
        <Container className="flex flex-col gap-2 py-4 text-xs text-black/50 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Fit Rooms</span>
          <span>坚持打卡，团队共进。</span>
        </Container>
      </footer>
    </div>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}> 
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
