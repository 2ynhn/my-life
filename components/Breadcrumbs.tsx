import Link from "next/link";
import { hrefFor, type Entry } from "@/lib/drive";

export function Breadcrumbs({ entry }: { entry: Entry }) {
  const chain: Entry[] = [];
  for (let e: Entry | null = entry; e; e = e.parent) chain.unshift(e);

  return (
    <nav className="crumbs" aria-label="경로">
      {chain.map((e, i) => (
        <span key={e.id}>
          {i > 0 && <span className="sep">/</span>}
          {i < chain.length - 1 ? <Link href={hrefFor(e)}>{e.parent ? e.name : "my-life"}</Link> : <span>{e.parent ? e.slug : "my-life"}</span>}
        </span>
      ))}
    </nav>
  );
}
