import Link from "next/link";
import { Suspense } from "react";
import { TopNav } from "@/components/TopNav";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const who = user.name ?? user.email;

  return (
    <div className="shell">
      <header className="topbar">
        <Suspense fallback={null}>
          <TopNav />
        </Suspense>
        <div className="spacer" />
        {/* 일기장 안에서 모바일 메뉴 버튼이 여기로 들어온다 (Sidebar) */}
        <span id="nav-slot" className="nav-slot" />
        {/* 구글 프로필 사진 = 설정·계정. 일기장 안에서는 사이드바 아래에 있어서 숨긴다 */}
        <Link className="avatar-link" href="/settings" aria-label={`설정 (${who})`} title={`설정 · ${user.email}`}>
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
    </div>
  );
}
