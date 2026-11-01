import Link from "next/link";
import { SearchForm } from "@/components/SearchForm";
import { metaTags, splitFrontmatter } from "@/lib/markdown";

// 검색: 기기에 받아 둔 글에서 바로 찾는다 (제목·경로 → 내용, 글자 단위). 태그는 앞머리 tags로.
// 아직 받지 않은 글은 제목만 보고, 받는 대로 결과가 늘어난다.

/** path: 일기장 맨 위부터 부모까지의 이름. text: 받아 둔 내용 (없으면 아직) */
export type SearchNote = { id: string; name: string; slug: string; href: string; path: string[]; text?: string };
type Hit = { note: SearchNote; inTitle: boolean; snippet: string | null };

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

function snippetOf(text: string, needle: string): string | null {
  const body = splitFrontmatter(text).body;
  const i = body.toLowerCase().indexOf(needle);
  if (i < 0) return null;
  const start = Math.max(0, i - 50);
  const end = Math.min(body.length, i + needle.length + 70);
  return (start > 0 ? "…" : "") + body.slice(start, end).replace(/\s+/g, " ").trim() + (end < body.length ? "…" : "");
}

/** 날짜 이름(최신 먼저) */
const newestFirst = (a: SearchNote, b: SearchNote) => b.name.localeCompare(a.name, "ko");

export function searchNotes(notes: SearchNote[], q: string, tag: string): Hit[] {
  if (tag && !q) {
    const want = tag.trim().toLowerCase();
    if (!want) return [];
    return notes
      .filter((n) => n.text && metaTags(splitFrontmatter(n.text).meta).some((t) => t.toLowerCase() === want))
      .sort(newestFirst)
      .map((note) => ({ note, inTitle: false, snippet: null }));
  }
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const hits: Hit[] = [];
  for (const note of notes) {
    const inTitle = [...note.path, note.slug].join("/").toLowerCase().includes(needle);
    const snippet = note.text ? snippetOf(note.text, needle) : null;
    if (inTitle || snippet !== null || note.text?.toLowerCase().includes(needle)) hits.push({ note, inTitle, snippet });
  }
  return hits.sort((a, b) => Number(b.inTitle) - Number(a.inTitle) || newestFirst(a.note, b.note));
}

export function SearchView({ base, notes, q, tag }: { base: string; notes: SearchNote[]; q: string; tag: string }) {
  const isTag = !!tag && !q;
  const hits = searchNotes(notes, q, tag);
  const needle = q.trim().toLowerCase();
  const read = notes.filter((n) => n.text !== undefined).length;

  return (
    <div className="search">
      <SearchForm className="search-form" action={base}>
        <input type="hidden" name="view" value="search" />
        <input name="q" defaultValue={q} placeholder="일기 검색" aria-label="검색어" autoFocus={!q && !tag} />
        <button className="btn btn-save" type="submit">
          검색
        </button>
      </SearchForm>

      {isTag ? (
        <h1 className="page-title">#{tag}</h1>
      ) : (
        q && <h1 className="page-title">&lsquo;{q}&rsquo; 검색 결과</h1>
      )}

      {(q || tag) && (
        <p className="muted small">
          {hits.length}개 찾음
          {read < notes.length && ` · 전체 ${notes.length}개 글 중 ${read}개를 받아 찾았어요. 나머지는 받는 대로 더해져요.`}
          {q && (
            <>
              {" · "}
              <Link href={`${base}?view=ask&q=${encodeURIComponent(q)}`}>Claude에게 물어보기</Link>
            </>
          )}
        </p>
      )}

      {hits.length > 0 && (
        <ul className="note-list search-hits">
          {hits.map(({ note, snippet }) => (
            <li key={note.id}>
              <Link href={note.href}>
                <span className="hit-head">
                  <span className="title">
                    <Highlight text={note.slug} needle={needle} />
                  </span>
                  <span className="muted small">{note.path.join(" / ")}</span>
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
