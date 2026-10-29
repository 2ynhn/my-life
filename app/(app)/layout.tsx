import { Settings } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { SaveStatus } from "@/components/SaveStatus";
import { TopNav } from "@/components/TopNav";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const who = user.name ?? user.email;

  return (
    <div className="shell">
      <header className="topbar">
        {/* 일기장 안에서 모바일 메뉴(삼선) 버튼이 여기로 들어온다 (Sidebar) */}
        <span id="nav-slot" className="nav-slot" />
        <Suspense fallback={null}>
          <TopNav />
        </Suspense>
        <div className="spacer" />
        {/* 사이드 메뉴가 없는 화면(일기장 목록 등)에서만: 설정은 평소 사이드 메뉴 아래에 있다 */}
        <Link className="btn topbar-settings" href="/settings" title="설정">
          <Settings size={16} aria-hidden />
          <span className="btn-label">설정</span>
        </Link>
        {/* 구글 프로필 사진: 누르면 첫 화면 */}
        <Link className="avatar-link" href="/" aria-label={`홈 (${who})`} title={user.email}>
          {user.image ? (
            // 구글 프로필 사진은 리퍼러가 붙으면 가끔 막혀서 no-referrer
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" width={32} height={32} referrerPolicy="no-referrer" />
          ) : (
            <span aria-hidden>{who.slice(0, 1).toUpperCase()}</span>
          )}
        </Link>
      </header>
      <main className="content">{children}</main>
      <SaveStatus />
    </div>
  );
}
