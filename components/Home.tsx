import Link from "next/link";
import { CalendarDays, Clock, ExternalLink, History, Plus, Search } from "lucide-react";
import { startFeature } from "@/app/(app)/note-actions";
import { todayKST } from "@/components/CalendarView";
import { FeatureIcon } from "@/components/FeatureIcon";
import {
  folderKind,
  hrefFor,
  isListable,
  visibleChildren,
  webUrlFor,
  type DriveIndex,
  type Entry,
  type FileEntry,
  type FolderEntry,
} from "@/lib/drive";
import { FEATURES, featureByName, type Feature, type FeatureKey } from "@/lib/features";
import { libraryTitle } from "@/lib/labels";

// 일기장 첫 화면: 폴더 구조 대신 쓰임새(일기·구매·여행·건강) 카드로.
// 숫자는 Drive 목록(이름·수정 시각)만으로 센다 — 글을 열어 읽지 않아 빠르다.

type Past = { years: number; note: FileEntry };

/** 폴더 안(하위 폴더 포함)의 보이는 글 */
function notesIn(folder: FolderEntry): FileEntry[] {
  return visibleChildren(folder).flatMap((c) => (c.kind === "file" ? [c] : notesIn(c)));
}

const byNameDesc = (a: FileEntry, b: FileEntry) => b.name.localeCompare(a.name);
const thisYear = () => new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date());
/** 올해면 10.28, 아니면 2020.10.28 */
const md = (date: string) =>
  `${date.slice(0, 4) === thisYear() ? "" : `${date.slice(0, 4)}.`}${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}`;
const hasDate = (n: FileEntry) => /^\d{4}-\d{2}-\d{2}/.test(n.slug);

type Card = {
  feature: Feature;
  folder: FolderEntry;
  stat: { value: number; unit: string };
  sub: string | null;
  action: { href: string; label: string } | null;
};

function card(feature: Feature, folder: FolderEntry, today: string, diary: string | null): Card {
  const notes = notesIn(folder).sort(byNameDesc);
  const dated = notes.filter(hasDate);
  const latest = dated[0] ?? notes[0];
  const todays = dated.find((n) => n.slug.startsWith(today));
  const newHref = folder.can.addChildren ? `${hrefFor(folder)}?mode=new` : null;
  const base = { feature, folder };
  switch (feature.key) {
    case "diary":
      return {
        ...base,
        stat: { value: dated.filter((n) => n.slug.startsWith(today.slice(0, 4))).length, unit: "올해" },
        sub: latest ? `마지막 ${hasDate(latest) ? md(latest.slug) : latest.slug}` : null,
        action: todays ? { href: hrefFor(todays), label: "오늘 일기 보기" } : diary ? { href: diary, label: "오늘 일기 쓰기" } : null,
      };
    case "spending":
      return {
        ...base,
        stat: { value: dated.filter((n) => n.slug.startsWith(today.slice(0, 7))).length, unit: "이번 달" },
        sub: latest ? `최근 ${hasDate(latest) ? md(latest.slug) : latest.slug}` : null,
        action: newHref ? { href: newHref, label: feature.action } : null,
      };
    case "travel":
      return {
        ...base,
        stat: { value: notes.length, unit: "여행" },
        sub: latest ? `최근 ${latest.slug}` : null,
        action: newHref ? { href: newHref, label: feature.action } : null,
      };
    case "health":
      return {
        ...base,
        stat: { value: dated.length, unit: "기록" },
        sub: latest ? `마지막 ${hasDate(latest) ? md(latest.slug) : latest.slug}` : null,
        action: todays ? { href: hrefFor(todays), label: "오늘 기록 보기" } : newHref ? { href: newHref, label: feature.action } : null,
      };
  }
}

function FeatureCard({ c }: { c: Card }) {
  const { feature, folder } = c;
  return (
    <li className={`fcard fcard-${feature.key}`}>
      <Link href={hrefFor(folder)} className="fcard-main">
        <span className="fcard-head">
          <FeatureIcon kind={feature.key} size="lg" />
          <span className="fcard-name">
            <strong>{feature.label}</strong>
            {folder.name.toLowerCase() !== feature.label && <span className="muted small">{folder.name}</span>}
          </span>
        </span>
        <span className="fcard-stat">
          <span className="muted small">{c.stat.unit}</span>
          <strong>{c.stat.value.toLocaleString("ko-KR")}</strong>
        </span>
        <span className="fcard-sub muted small">{c.sub ?? "아직 글이 없어요"}</span>
      </Link>
      {c.action && (
        <Link href={c.action.href} className="fcard-action">
          {c.action.href.includes("mode=new") && <Plus size={16} strokeWidth={2} aria-hidden />}
          {c.action.label}
        </Link>
      )}
    </li>
  );
}

function StartCard({ feature, rootId }: { feature: Feature; rootId: string }) {
  return (
    <li className={`fcard fcard-${feature.key} fcard-start`}>
      <div className="fcard-main">
        <span className="fcard-head">
          <FeatureIcon kind={feature.key} size="lg" />
          <span className="fcard-name">
            <strong>{feature.label}</strong>
            <span className="muted small">{feature.folder} 폴더 없음</span>
          </span>
        </span>
        <span className="fcard-sub muted small">{feature.intro}</span>
      </div>
      <form action={startFeature.bind(null, rootId, feature.key)}>
        <button type="submit" className="fcard-action">
          <Plus size={16} strokeWidth={2} aria-hidden />
          시작하기
        </button>
      </form>
    </li>
  );
}

export async function Home({
  root,
  index,
  diary,
  past,
  recent,
}: {
  root: FolderEntry;
  index: DriveIndex;
  diary: string | null;
  past: Past[];
  recent: FileEntry[];
}) {
  const today = todayKST();
  const folders = visibleChildren(root).filter((c): c is FolderEntry => c.kind === "folder");
  // 쓰임새: 템플릿으로 판단(구매·여행·건강), 일기는 이름으로
  const kinds = await Promise.all(
    folders.map(async (f): Promise<FeatureKey | null> =>
      featureByName(f.name) === "diary" ? "diary" : ((await folderKind(index, f).catch(() => null)) ?? featureByName(f.name)),
    ),
  );
  const cards: Card[] = [];
  const missing: Feature[] = [];
  const used = new Set<FolderEntry>();
  for (const feature of FEATURES) {
    const i = kinds.findIndex((k, j) => k === feature.key && !used.has(folders[j]));
    if (i < 0) {
      missing.push(feature);
      continue;
    }
    used.add(folders[i]);
    cards.push(card(feature, folders[i], today, diary));
  }
  const others = folders.map((f, i) => ({ f, kind: kinds[i] })).filter(({ f }) => !used.has(f));
  const rootNotes = visibleChildren(root).filter((c): c is FileEntry => c.kind === "file");
  const dateLabel = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "long" }).format(
    new Date(),
  );

  return (
    <div className="home">
      <div className="home-head">
        <p className="home-date muted small">
          {dateLabel}
          <a href={webUrlFor(root)} target="_blank" rel="noopener noreferrer">
            Drive에서 열기 <ExternalLink size={12} aria-hidden />
          </a>
        </p>
        <h1 className="page-title">{libraryTitle(root.lib)}</h1>
        {!root.lib.ownedByMe && (
          <p className="muted small">
            {root.lib.ownerName}님이 Drive에서 공유한 일기장입니다.{" "}
            {root.can.edit ? "편집 권한이 있어 글을 쓰고 고칠 수 있어요." : "읽기만 할 수 있어요."}
          </p>
        )}
      </div>

      <div className="lib-tools">
        <form className="search-form home-search" action={root.lib.base}>
          <input type="hidden" name="view" value="search" />
          <Search size={18} className="search-icon" aria-hidden />
          <input name="q" placeholder="일기 검색" aria-label="검색어" />
          <button className="btn" type="submit">
            검색
          </button>
        </form>
        <Link className="btn" href={`${root.lib.base}?view=calendar`}>
          <CalendarDays size={16} aria-hidden />
          캘린더
        </Link>
      </div>

      <ul className="features">
        {cards.map((c) => (
          <FeatureCard key={c.feature.key} c={c} />
        ))}
        {root.can.addChildren && missing.map((f) => <StartCard key={f.key} feature={f} rootId={root.lib.rootId} />)}
      </ul>

      {past.length > 0 && (
        <section className="on-this-day home-section">
          <h2>
            <History size={18} aria-hidden /> 지난 오늘
          </h2>
          <ul className="note-list">
            {past.map(({ years, note }) => (
              <li key={note.id}>
                <Link href={hrefFor(note)}>
                  <span className="title">{note.slug}</span>
                  <span className="muted small">{years}년 전</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section className="recent home-section">
          <h2>
            <Clock size={18} aria-hidden /> 최근 수정
          </h2>
          <ul className="note-list">
            {recent.map((n) => (
              <li key={n.id}>
                <Link href={hrefFor(n)}>
                  <span className="title">{n.slug}</span>
                  <span className="muted small">{n.slugPath.slice(0, -1).join(" / ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(others.length > 0 || rootNotes.length > 0) && (
        <section className="home-section">
          <h2>다른 폴더</h2>
          {others.length > 0 && (
            <ul className="folder-grid">
              {others.map(({ f, kind }) => (
                <li key={f.id}>
                  <Link href={hrefFor(f)}>
                    <FeatureIcon kind={kind} restricted={f.restricted} size="sm" />
                    <span className="name">{f.name}</span>
                    <span className="count">{visibleChildren(f).length}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {rootNotes.length > 0 && (
            <ul className="note-list">
              {rootNotes.map((n) => (
                <li key={n.id}>
                  <Link href={hrefFor(n)}>
                    <span className="title">{n.slug}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** _templates 같은 숨김 폴더 안의 글은 최근 목록에서 뺀다 */
export function hiddenAncestor(e: Entry): boolean {
  for (let f = e.parent; f?.parent; f = f.parent) if (!isListable(f)) return true;
  return false;
}
