import { BookHeart, Settings } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { RefreshButton } from "@/components/RefreshButton";
import { TopNav } from "@/components/TopNav";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();

  return (
    <div className="shell">
      <header className="topbar">
        <Suspense
          fallback={
            <Link href="/" className="brand">
              <BookHeart size={20} strokeWidth={1.75} aria-hidden />
              my-life
            </Link>
          }
        >
          <TopNav />
        </Suspense>
        <div className="spacer" />
        {/* 일기장 안에서 모바일 '폴더' 버튼이 여기로 들어온다 (Sidebar) */}
        <span id="nav-slot" className="nav-slot" />
        <RefreshButton />
        <Link className="btn" href="/settings" title="설정">
          <Settings size={16} aria-hidden />
          <span className="btn-label">설정</span>
        </Link>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
