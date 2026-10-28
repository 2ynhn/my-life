import type { Metadata } from "next";
import Link from "next/link";
import { DriveProblem } from "@/components/DriveProblem";
import { sharedLibraries, type Library } from "@/lib/drive";
import { libraryTitle } from "@/lib/labels";
import { myLibrary } from "@/lib/library";
import { requireUser } from "@/lib/session";
import { chooseLibrary, createLibrary } from "./actions";

export const metadata: Metadata = { title: "일기장" };

export default async function LibrariesPage() {
  const user = await requireUser();
  const mine = await myLibrary(user);
  if (mine.kind === "problem") return <DriveProblem message={mine.problem} reauth={mine.reauth} />;
  let shared: Library[] = [];
  try {
    shared = await sharedLibraries(user);
  } catch (e) {
    console.error("[libraries] shared", e);
  }

  return (
    <div className="libraries">
      <h1 className="page-title">일기장</h1>

      <section>
        <h2>내 일기장</h2>
        {mine.kind === "ok" && (
          <ul className="person-list">
            <li>
              <Link href={mine.lib.base}>📔 {mine.lib.name}</Link>
              <span className="muted small">내 Drive</span>
            </li>
          </ul>
        )}
        {mine.kind === "choose" && (
          <>
            <p className="muted small">내 Drive에 my-life 폴더가 여러 개 있습니다. 일기장으로 쓸 폴더를 고르세요.</p>
            <ul className="person-list">
              {mine.options.map((lib) => (
                <li key={lib.rootId}>
                  <span className="email">📔 {lib.name}</span>
                  <a className="small muted" href={`https://drive.google.com/drive/folders/${lib.rootId}`} target="_blank" rel="noopener noreferrer">
                    Drive에서 보기 ↗
                  </a>
                  <form action={chooseLibrary.bind(null, lib.rootId)}>
                    <button className="btn btn-save" type="submit">
                      이걸로
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </>
        )}
        {mine.kind === "none" && (
          <div className="empty-lib">
            <p className="muted small">
              내 Drive에 my-life 폴더가 없습니다. 만들면 Drive 맨 위에 <code>my-life</code> 폴더가 생기고, 여기에 일기를 씁니다.
            </p>
            <form action={createLibrary}>
              <button className="btn btn-save" type="submit">
                내 일기장 만들기
              </button>
            </form>
          </div>
        )}
      </section>

      <section>
        <h2>공유받은 일기장</h2>
        {shared.length === 0 ? (
          <p className="muted small">
            다른 사람이 Drive에서 my-life 폴더를 공유하면 여기에 나타납니다. 초대 주소(…/d/폴더ID)를 받았다면 그 주소로 바로 열 수
            있어요.
          </p>
        ) : (
          <ul className="person-list">
            {shared.map((lib) => (
              <li key={lib.rootId}>
                <Link href={lib.base}>📔 {libraryTitle(lib)}</Link>
                <span className="muted small">{lib.ownerEmail}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
