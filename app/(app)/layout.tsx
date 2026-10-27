import { Sidebar } from "@/components/Sidebar";
import { folderTree, getIndex } from "@/lib/drive";
import { requireUser } from "@/lib/session";
import { logout, refreshIndex } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const index = await getIndex();

  return (
    <div className="shell">
      <header className="topbar">
        <Sidebar tree={folderTree(index.root)} />
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
