import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DriveIndex, FileEntry } from "@/lib/drive";
import { formatMetaValue, metaTags, rewriteObsidian, splitFrontmatter } from "@/lib/markdown";

const HIDDEN_META = new Set(["title", "tags"]);

export function NoteView({ file, text, index }: { file: FileEntry; text: string; index: DriveIndex }) {
  const { meta, body } = splitFrontmatter(text);
  const tags = metaTags(meta);
  const extra = Object.entries(meta).filter(([k]) => !HIDDEN_META.has(k));
  const markdown = rewriteObsidian(body, file.parent!, index);

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
          remarkPlugins={[remarkGfm]}
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
