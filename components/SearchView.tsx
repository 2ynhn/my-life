import Link from "next/link";
import { hrefFor, type DriveIndex } from "@/lib/drive";
import { searchTag, searchText } from "@/lib/search";

/** 찾은 글자를 굵게 */
function Highlight({ text, needle }: { text: string; needle: string }) {
  if (!needle) return <>{text}</>;
  const lower = text.toLowerCase();
  const out: React.ReactNode[] = [];
  let at = 0;
  for (let i = lower.indexOf(needle); i >= 0; i = lower.indexOf(needle, i + needle.length)) {
    out.push(text.slice(at, i), <mark key={i}>{text.slice(i, i + needle.length)}</mark>);
    at = i + needle.length;
  }
  out.push(text.slice(at));
  return <>{out}</>;
}

export async function SearchView({ index, q, tag }: { index: DriveIndex; q: string; tag: string }) {
  const base = index.lib.base;
  const isTag = !!tag && !q;
  const result = isTag ? await searchTag(index, tag) : await searchText(index, q);
  const needle = q.trim().toLowerCase();
  const again = isTag ? `${base}?view=search&tag=${encodeURIComponent(tag)}` : `${base}?view=search&q=${encodeURIComponent(q)}`;

  return (
    <div className="search">
      <form className="search-form" action={base}>
        <input type="hidden" name="view" value="search" />
        <input name="q" defaultValue={q} placeholder="일기 검색" aria-label="검색어" autoFocus={!q && !tag} />
        <button className="btn btn-save" type="submit">
          검색
        </button>
      </form>

      {isTag ? (
        <h1 className="page-title">#{tag}</h1>
      ) : (
        q && <h1 className="page-title">&lsquo;{q}&rsquo; 검색 결과</h1>
      )}

      {(q || tag) && (
        <p className="muted small">
          {result.hits.length}개 찾음
          {result.scanned < result.total && (
            <>
              {" · "}
              전체 {result.total}개 글 중 {result.scanned}개를 살펴봤어요.{" "}
              <Link href={again}>계속 찾기</Link>
            </>
          )}
          {result.driveFailed && " · Drive 검색을 쓰지 못해 직접 훑은 결과만 보여 줍니다."}
        </p>
      )}

      {result.hits.length > 0 && (
        <ul className="note-list search-hits">
          {result.hits.map(({ file, snippet }) => (
            <li key={file.id}>
              <Link href={hrefFor(file)}>
                <span className="hit-head">
                  <span className="title">
                    <Highlight text={file.slug} needle={needle} />
                  </span>
                  <span className="muted small">{file.slugPath.slice(0, -1).join(" / ")}</span>
                </span>
                {snippet && (
                  <span className="snippet small">
                    <Highlight text={snippet} needle={needle} />
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
