import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DriveProblem } from "@/components/DriveProblem";
import { GuestManager } from "@/components/GuestManager";
import { emailList } from "@/lib/access";
import { hrefFor, loadIndex, privateFolders } from "@/lib/drive";
import { driveGuests } from "@/lib/guests";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "설정" };

export default async function SettingsPage() {
  const user = await requireUser();
  // 게스트에게는 이 화면이 있다는 것도 알리지 않는다
  if (user.role !== "owner") notFound();

  const { index, problem } = await loadIndex();
  if (!index) return <DriveProblem message={problem} />;

  const owners = emailList(process.env.OWNER_EMAILS);
  const envGuests = emailList(process.env.GUEST_EMAILS);
  const guests = await driveGuests();
  const hidden = privateFolders(index);

  return (
    <div className="settings">
      <h1 className="page-title">설정</h1>

      <section>
        <h2>게스트</h2>
        <p className="muted small">
          게스트는 글을 읽기만 할 수 있고, 🔒 비공개 폴더는 볼 수 없습니다. 해제하면 1분 안에 차단됩니다. 목록은 Drive의{" "}
          <code>_settings/guests.json</code>에 저장됩니다.
        </p>
        <GuestManager guests={guests} />
        {envGuests.length > 0 && (
          <>
            <h3>환경변수로 등록된 게스트</h3>
            <p className="muted small">Vercel의 GUEST_EMAILS에서만 바꿀 수 있습니다.</p>
            <ul className="person-list">
              {envGuests.map((e) => (
                <li key={e}>
                  <span className="email">{e}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section>
        <h2>게스트에게 숨겨진 폴더</h2>
        <p className="muted small">
          폴더에 <code>.private</code> 파일을 두면 그 폴더와 하위 폴더가 숨겨집니다. <code>_</code>로 시작하는 앱
          내부 폴더(_settings, _templates)는 항상 숨겨집니다.
        </p>
        {hidden.length === 0 ? (
          <p className="muted small">없음</p>
        ) : (
          <ul className="person-list">
            {hidden.map((f) => (
              <li key={f.id}>
                <Link href={hrefFor(f)}>🔒 {f.slugPath.join(" / ")}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>소유자</h2>
        <p className="muted small">
          보안을 위해 소유자는 이 화면에서 바꿀 수 없고, Vercel 환경변수 OWNER_EMAILS로만 정합니다.
        </p>
        <ul className="person-list">
          {owners.map((e) => (
            <li key={e}>
              <span className="email">{e}</span>
              <span className="badge owner">소유자</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
