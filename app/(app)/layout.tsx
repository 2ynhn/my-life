import { Sidebar } from "@/components/Sidebar";
import { folderTree, loadIndex } from "@/lib/drive";
import { requireUser } from "@/lib/session";
import { logout, refreshIndex } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Drive 문제는 페이지 쪽에서 안내하므로 여기서는 빈 트리로 둔다
  const { index } = await loadIndex();

  return (
    <div className="shell">
      <header className="topbar">
        <Sidebar tree={index ? folderTree(index.root) : []} />
        <div className="spacer" />
        <form action={refreshIndex}>
          <button className="btn" type="submit" title="Drive에서 다시 불러오기">
            새로고침
          </button>
        </form>
        <span className="user small" title={user.email}>
          {user.name ?? user.email}
          <span className={`badge ${user.role}`}>{user.role === "owner" ? "소유자" : "게스트"}</span>
        </span>
        <form action={logout}>
          <button className="btn" type="submit">
            로그아웃
          </button>
        </form>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
