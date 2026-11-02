import {
  Activity,
  Banknote,
  CalendarDays,
  CreditCard,
  Folder,
  List,
  MapPin,
  Star,
  Store,
  Tag,
  Text,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { METRICS } from "@/lib/health-metrics";
import { formatMetaValue, metaTags, rewriteObsidian, splitFrontmatter, type LinkResolver } from "@/lib/markdown";

// 노트 본문 렌더링. 서버(보기 화면)와 클라이언트(편집기 미리보기·기기 사본 화면) 양쪽에서 쓴다.
// 맨 위 # 제목은 큰 제목으로, 앞머리는 속성판(아이콘 · 이름 · 값 한 줄씩)으로, 본문은 상자 없이 이어서.

/** 앞머리 이름 → 화면 이름·아이콘 (모르는 이름은 그대로) */
const PROPS: Record<string, { label: string; icon: LucideIcon }> = {
  date: { label: "날짜", icon: CalendarDays },
  start: { label: "출발", icon: CalendarDays },
  end: { label: "돌아온 날", icon: CalendarDays },
  people: { label: "사람", icon: Users },
  companions: { label: "함께 간 사람", icon: Users },
  store: { label: "가게", icon: Store },
  amount: { label: "금액", icon: Banknote },
  price: { label: "가격", icon: Banknote },
  category: { label: "분류", icon: Folder },
  payment: { label: "결제", icon: CreditCard },
  items: { label: "품목", icon: List },
  restaurant: { label: "식당", icon: UtensilsCrossed },
  menu: { label: "메뉴", icon: UtensilsCrossed },
  rating: { label: "별점", icon: Star },
  place: { label: "장소", icon: MapPin },
  places: { label: "들른 곳", icon: MapPin },
  checkup: { label: "검진", icon: Activity },
};
/** 보기에서 감추는 앞머리: 제목(큰 제목으로)·작성일(날짜와 같음)·태그(따로) */
const HIDDEN_META = new Set(["title", "tags", "written"]);
const PILL_KEYS = new Set(["people", "companions", "menu", "category"]);

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const empty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

function Value({ k, v }: { k: string; v: unknown }) {
  if (PILL_KEYS.has(k)) {
    const list = Array.isArray(v) ? v.map(formatMetaValue) : [formatMetaValue(v)];
    return (
      <span className="prop-pills">
        {list.filter(Boolean).map((p) => (
          <span key={p} className="pill">
            {p}
          </span>
        ))}
      </span>
    );
  }
  if ((k === "amount" || k === "price") && typeof v === "number") return <span className="prop-strong">{won(v)}</span>;
  if (k === "rating" && typeof v === "number") return <span>{"★".repeat(Math.max(0, Math.min(5, Math.round(v))))}</span>;
  if (k === "items" && Array.isArray(v)) {
    return (
      <span className="prop-items">
        {v.map((it, i) => {
          const o: Record<string, unknown> = it && typeof it === "object" ? (it as Record<string, unknown>) : { name: it };
          const price = typeof o.price === "number" && o.price ? won(o.price) : "";
          return o.name ? (
            <span key={i}>
              <span>{String(o.name)}</span>
              {price && <span className="muted">{price}</span>}
            </span>
          ) : null;
        })}
      </span>
    );
  }
  const metric = METRICS[k];
  if (metric && typeof v === "number") return <span>{`${v.toLocaleString("ko-KR")}${metric.unit ? ` ${metric.unit}` : ""}`}</span>;
  return <span>{formatMetaValue(v)}</span>;
}

export function NoteBody({
  text,
  links,
  tagHref,
  title: fallbackTitle,
}: {
  text: string;
  links: LinkResolver;
  /** 주면 태그가 그 태그 모아보기 링크가 된다 */
  tagHref?: (tag: string) => string;
  /** 본문에 # 제목이 없을 때 큰 제목으로 (보통 파일 이름) */
  title?: string;
}) {
  const { meta, body } = splitFrontmatter(text);
  const tags = metaTags(meta);
  const props = Object.entries(meta).filter(([k, v]) => !HIDDEN_META.has(k) && !empty(v));
  // 맨 위 # 제목은 큰 제목으로 빼서 속성판 위에 둔다
  const top = /^(?:[ \t]*\r?\n)*#[ \t]+([^\r\n]+)(?:\r?\n)?/.exec(body);
  const heading = top?.[1].trim() || String(meta.title ?? "").trim() || fallbackTitle || "";
  const markdown = rewriteObsidian(top ? body.slice(top[0].length) : body, links);

  return (
    <article>
      {heading && <h1 className="note-title">{heading}</h1>}
      {(props.length > 0 || tags.length > 0) && (
        <header className="meta">
          <dl>
            {props.map(([k, v]) => {
              const p = PROPS[k];
              const metric = METRICS[k];
              const Icon = p?.icon ?? (metric ? Activity : Text);
              return (
                <div key={k} className="prop">
                  <dt>
                    <Icon size={18} strokeWidth={1.75} aria-hidden />
                    {p?.label ?? metric?.label ?? k}
                  </dt>
                  <dd>
                    <Value k={k} v={v} />
                  </dd>
                </div>
              );
            })}
            {tags.length > 0 && (
              <div className="prop">
                <dt>
                  <Tag size={18} strokeWidth={1.75} aria-hidden />
                  태그
                </dt>
                <dd>
                  <ul className="tags">
                    {tags.map((t) => (
                      <li key={t}>{tagHref ? <a href={tagHref(t)}>#{t}</a> : `#${t}`}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
          </dl>
        </header>
      )}
      <div className="prose">
        <ReactMarkdown
          // 옵시디언처럼 줄바꿈 한 번도 줄바꿈으로 보여 준다
          remarkPlugins={[remarkGfm, remarkBreaks]}
          components={{
            // eslint-disable-next-line @next/next/no-img-element
            img: ({ src, alt }) => <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} loading="lazy" />,
            a: ({ href, children }) =>
              href && /^https?:/i.test(href) ? (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ) : (
                <a href={href}>{children}</a>
              ),
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </article>
  );
}
