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
          my-life
        </Link>
        <div className="spacer" />
        <RefreshButton />
        <Link className="btn" href="/settings">
          설정
        </Link>
        <span className="user small" title={user.email}>
          {user.name ?? user.email}
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
