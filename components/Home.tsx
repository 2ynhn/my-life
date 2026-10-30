import Link from "next/link";
import { CalendarDays, ChevronRight, Clock, History, Layers, PenLine, Plus, Search, Sparkles } from "lucide-react";
import { NewFolderButton } from "@/components/NewFolderButton";
import { QuickNote } from "@/components/QuickNote";
import { startFeature } from "@/app/(app)/note-actions";
import { todayKST } from "@/lib/today";
import { FeatureIcon } from "@/components/FeatureIcon";
import { FEATURES, type Feature, type FeatureKey } from "@/lib/features";

// 일기장 첫 화면: 폴더 구조 대신 쓰임새(일기·구매·여행·건강) 카드로.
// 숫자는 Drive 목록(이름·수정 시각)만으로 센다 — 글을 열어 읽지 않아 빠르다.
// 서버(Drive 목록)와 기기에 받아 둔 목록(LocalPreview) 양쪽에서 같은 모양으로 그리도록, 목록을 HomeNode로 받는다.

/** 첫 화면이 쓰는 목록 한 칸 (서버 Entry·기기 LocalEntry에서 만든다) */
export type HomeNode = {
  kind: "folder" | "file";
  id: string;
  name: string;
  slug: string;
  href: string;
  modifiedTime: string;
  isMarkdown: boolean;
  /** 목록에 보이는지 (md 글, attachments·_ 아닌 폴더) */
  listable: boolean;
  restricted: boolean;
  can: { addChildren: boolean; edit: boolean };
  /** 일기장 맨 위부터 부모까지의 이름 */
  path: string[];
  children: HomeNode[];
};

export type HomeData = {
  root: HomeNode;
  base: string;
  rootId: string;
  ownedByMe: boolean;
  ownerName: string;
  /** 맨 위 폴더 id → 쓰임새 */
  kinds: Record<string, FeatureKey | null>;
};

type Past = { years: number; note: HomeNode };

const visibleChildren = (f: HomeNode) => f.children.filter((c) => c.listable);

/** 폴더 안(하위 폴더 포함)의 보이는 글 */
function notesIn(folder: HomeNode): HomeNode[] {
  return visibleChildren(folder).flatMap((c) => (c.kind === "file" ? [c] : notesIn(c)));
}

/** 숨김 폴더(_templates 등)에 들어 있지 않은 모든 md 글 */
function allNotes(root: HomeNode): HomeNode[] {
  const out: HomeNode[] = [];
  const walk = (f: HomeNode) => {
    for (const c of f.children) {
      if (c.kind === "file") {
        if (c.isMarkdown) out.push(c);
      } else if (c.listable) walk(c);
    }
  };
  walk(root);
  return out;
}

/** 오늘 일기 쓰기 주소: daily 폴더에 바로 */
function diaryHref(root: HomeNode): string | null {
  const daily = root.children.find((c) => c.kind === "folder" && c.name.toLowerCase() === "daily");
  return daily?.can.addChildren ? `${daily.href}?mode=new` : null;
}

/** 지난 오늘: 몇 해 전 같은 날짜 이름의 글 */
function onThisDay(notes: HomeNode[], today: string): Past[] {
  const out: Past[] = [];
  for (const note of notes) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(note.name);
    if (!m) continue;
    const date = `${m[1]}-${m[2]}-${m[3]}`;
    if (date.slice(5) !== today.slice(5) || date >= today) continue;
    out.push({ years: Number(today.slice(0, 4)) - Number(m[1]), note });
  }
  return out.sort((a, b) => a.years - b.years);
}

const byNameDesc = (a: HomeNode, b: HomeNode) => b.name.localeCompare(a.name);
const thisYear = () => new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date());
/** 올해면 10.28, 아니면 2020.10.28 */
const md = (date: string) =>
  `${date.slice(0, 4) === thisYear() ? "" : `${date.slice(0, 4)}.`}${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}`;
const hasDate = (n: HomeNode) => /^\d{4}-\d{2}-\d{2}/.test(n.slug);

type Card = {
  feature: Feature;
  folder: HomeNode;
  stat: { value: number; unit: string };
  sub: string | null;
  action: { href: string; label: string } | null;
};

function card(feature: Feature, folder: HomeNode, today: string, diary: string | null): Card {
  const notes = notesIn(folder).sort(byNameDesc);
  const dated = notes.filter(hasDate);
  const latest = dated[0] ?? notes[0];
  const todays = dated.find((n) => n.slug.startsWith(today));
  const newHref = folder.can.addChildren ? `${folder.href}?mode=new` : null;
  const base = { feature, folder };
  switch (feature.key) {
    case "diary":
      return {
        ...base,
        stat: { value: dated.filter((n) => n.slug.startsWith(today.slice(0, 4))).length, unit: "올해" },
        sub: latest ? `마지막 ${hasDate(latest) ? md(latest.slug) : latest.slug}` : null,
        action: todays ? { href: todays.href, label: "오늘 일기 보기" } : diary ? { href: diary, label: "오늘 일기 쓰기" } : null,
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
        action: todays ? { href: todays.href, label: "오늘 기록 보기" } : newHref ? { href: newHref, label: feature.action } : null,
      };
    case "food":
      return {
        ...base,
        stat: { value: dated.filter((n) => n.slug.startsWith(today.slice(0, 7))).length, unit: "이번 달" },
        sub: latest ? `최근 ${hasDate(latest) ? md(latest.slug) : latest.slug}` : null,
        action: newHref ? { href: newHref, label: feature.action } : null,
      };
  }
}

/** 일기 카드 위 띠: 오늘 일기 쓰기/보기 (카드의 바로가기를 크게) */
function TodayBand({ c }: { c: Card }) {
  if (!c.action) return null;
  return (
    <Link href={c.action.href} className="today-band">
      <span className="today-icon">
        <PenLine size={22} strokeWidth={1.8} aria-hidden />
      </span>
      <span className="today-text">
        <strong>{c.action.label}</strong>
        {c.sub && <span className="small">{c.sub}</span>}
      </span>
      <ChevronRight size={20} className="today-chevron" aria-hidden />
    </Link>
  );
}

function FeatureCard({ c, hideAction = false }: { c: Card; hideAction?: boolean }) {
  const { feature, folder } = c;
  return (
    <li className={`fcard fcard-${feature.key}`}>
      <Link href={folder.href} className="fcard-main">
        <span className="fcard-head">
          <FeatureIcon kind={feature.key} size="md" />
          <span className="fcard-name">
            <strong>{feature.label}</strong>
            {folder.name.toLowerCase() !== feature.label && <span className="muted small">{folder.name}</span>}
          </span>
        </span>
        <span className="fcard-stat">
          <strong>{c.stat.value.toLocaleString("ko-KR")}</strong>
          <span className="muted small">{c.stat.unit}</span>
        </span>
        <span className="fcard-sub muted small">{c.sub ?? "아직 글이 없어요"}</span>
      </Link>
      {c.action && !hideAction && (
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

export function Home({ data }: { data: HomeData }) {
  const { root } = data;
  const today = todayKST();
  const diary = diaryHref(root);
  const notes = allNotes(root);
  const past = onThisDay(notes, today);
  const recent = [...notes].sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime)).slice(0, 8);
  const folders = visibleChildren(root).filter((c) => c.kind === "folder");
  const kinds = folders.map((f) => data.kinds[f.id] ?? null);
  const cards: Card[] = [];
  const missing: Feature[] = [];
  const used = new Set<HomeNode>();
  for (const feature of FEATURES) {
    const i = kinds.findIndex((k, j) => k === feature.key && !used.has(folders[j]));
    if (i < 0) {
      missing.push(feature);
      continue;
    }
    used.add(folders[i]);
    cards.push(card(feature, folders[i], today, diary));
  }
  const diaryCard = cards.find((c) => c.feature.key === "diary");
  const diaryFolder = diaryCard?.folder;
  const canQuick = diaryFolder ? diaryFolder.can.addChildren || diaryFolder.can.edit : root.can.addChildren;
  const others = folders.map((f, i) => ({ f, kind: kinds[i] })).filter(({ f }) => !used.has(f));
  const rootNotes = visibleChildren(root).filter((c) => c.kind === "file");
  const dateLabel = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "long" }).format(
    new Date(),
  );

  return (
    <div className="home">
      <div className="home-head">
        {/* 매일 여는 화면이라 일기장 이름 대신 오늘 날짜만 (Drive에서 열기는 사이드 메뉴) */}
        <h1 className="home-date">{dateLabel}</h1>
        {!data.ownedByMe && (
          <p className="muted small">
            {data.ownerName}님이 Drive에서 공유한 일기장입니다.{" "}
            {root.can.edit ? "편집 권한이 있어 글을 쓰고 고칠 수 있어요." : "읽기만 할 수 있어요."}
          </p>
        )}
      </div>

      <div className="home-body">
        <div className="home-main">
          {canQuick && <QuickNote rootId={data.rootId} />}

          {diaryCard && <TodayBand c={diaryCard} />}

          <form className="search-form home-search" action={data.base}>
            <Search size={18} className="search-icon" aria-hidden />
            <input name="q" placeholder="검색하거나 물어보세요" aria-label="검색어 또는 질문" required />
            {/* 엔터는 첫 버튼(검색) */}
            <button className="btn" type="submit" name="view" value="search">
              검색
            </button>
            <button className="btn btn-ask" type="submit" name="view" value="ask" title="Claude가 일기를 찾아 읽고 답해요">
              <Sparkles size={16} aria-hidden />
              물어보기
            </button>
          </form>
          <div className="lib-tools">
            <Link className="btn" href={`${data.base}?view=calendar`}>
              <CalendarDays size={16} aria-hidden />
              캘린더
            </Link>
            <Link className="btn" href={`${data.base}?view=collect`}>
              <Layers size={16} aria-hidden />
              모아보기
            </Link>
          </div>

          <ul className="features">
            {cards.map((c) => (
              <FeatureCard key={c.feature.key} c={c} hideAction={c === diaryCard} />
            ))}
            {root.can.addChildren && missing.map((f) => <StartCard key={f.key} feature={f} rootId={data.rootId} />)}
          </ul>
        </div>

        <aside className="home-side">
          {past.length > 0 && (
            <section className="on-this-day home-section">
              <h2>
                <History size={18} aria-hidden /> 지난 오늘
              </h2>
              <ul className="note-list">
                {past.map(({ years, note }) => (
                  <li key={note.id}>
                    <Link href={note.href}>
                      <span className="past-years small">{years}년 전</span>
                      <span className="title">{note.slug}</span>
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
                    <Link href={n.href}>
                      <span className="title">{n.slug}</span>
                      <span className="muted small">{n.path.join(" / ")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {(others.length > 0 || rootNotes.length > 0 || root.can.addChildren) && (
        <section className="home-section">
          <div className="section-head">
            <h2>다른 폴더</h2>
            {root.can.addChildren && <NewFolderButton rootId={data.rootId} folderId={root.id} />}
          </div>
          {others.length > 0 && (
            <ul className="folder-grid">
              {others.map(({ f, kind }) => (
                <li key={f.id}>
                  <Link href={f.href}>
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
                  <Link href={n.href}>
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
