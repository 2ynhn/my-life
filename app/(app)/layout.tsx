import { BookHeart, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { RefreshButton } from "@/components/RefreshButton";
import { requireUser } from "@/lib/session";
import { logout } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand">
          <BookHeart size={20} strokeWidth={1.75} aria-hidden />
          my-life
        </Link>
        <div className="spacer" />
        <RefreshButton />
        <Link className="btn" href="/settings" title="설정">
          <Settings size={16} aria-hidden />
          <span className="btn-label">설정</span>
        </Link>
        <span className="user small" title={user.email}>
          {user.name ?? user.email}
        </span>
        <form action={logout}>
          <button className="btn" type="submit" title="로그아웃">
            <LogOut size={16} aria-hidden />
            <span className="btn-label">로그아웃</span>
          </button>
        </form>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
