import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { formatMetaValue, metaTags, rewriteObsidian, splitFrontmatter, type LinkResolver } from "@/lib/markdown";

const HIDDEN_META = new Set(["title", "tags"]);

/** 노트 본문 렌더링. 서버(보기 화면)와 클라이언트(편집기 미리보기) 양쪽에서 쓴다 */
export function NoteBody({ text, links }: { text: string; links: LinkResolver }) {
  const { meta, body } = splitFrontmatter(text);
  const tags = metaTags(meta);
  const extra = Object.entries(meta).filter(([k]) => !HIDDEN_META.has(k));
  const markdown = rewriteObsidian(body, links);

  return (
    <article>
      {(extra.length > 0 || tags.length > 0) && (
        <header className="meta">
          {extra.length > 0 && (
            <dl>
              {extra.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{formatMetaValue(v)}</dd>
                </div>
              ))}
            </dl>
          )}
          {tags.length > 0 && (
            <ul className="tags">
              {tags.map((t) => (
                <li key={t}>#{t}</li>
              ))}
            </ul>
          )}
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
