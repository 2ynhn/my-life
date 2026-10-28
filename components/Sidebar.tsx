"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { TreeNode } from "@/lib/drive";

function isWithin(pathname: string, href: string) {
  const p = decodeURIComponent(pathname);
  const h = decodeURIComponent(href);
  return p === h || p.startsWith(h + "/");
}

function Branch({ nodes, pathname }: { nodes: TreeNode[]; pathname: string }) {
  return (
    <ul>
      {nodes.map((node) => {
        const active = isWithin(pathname, node.href);
        const current = decodeURIComponent(pathname) === decodeURIComponent(node.href);
        const link = (
          <Link href={node.href} className={current ? "current" : undefined} aria-current={current ? "page" : undefined}>
            {node.name}
            {node.restricted && (
              <span className="lock" title="접근 제한: 상위 폴더를 공유받은 사람도 볼 수 없음" aria-label="접근 제한">
                🔒
              </span>
            )}
          </Link>
        );
        return (
          <li key={node.href}>
            {node.children.length ? (
              <details open={active}>
                <summary>{link}</summary>
                <Branch nodes={node.children} pathname={pathname} />
              </details>
            ) : (
              <span className="leaf">{link}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** 일기장 하나의 폴더 트리. title은 일기장 이름(공유받은 것이면 '누구의 my-life') */
export function Sidebar({ tree, title, homeHref }: { tree: TreeNode[]; title: string; homeHref: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="menu-toggle btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? "닫기" : "폴더"}
      </button>
      <nav
        className={`sidebar${open ? " open" : ""}`}
        aria-label="폴더"
        // 모바일: 링크를 누르면 메뉴를 닫는다
        onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}
      >
        <Link href="/libraries" className="libs small muted">
          ← 일기장 목록
        </Link>
        <Link href={homeHref} className={`home${decodeURIComponent(pathname) === decodeURIComponent(homeHref) ? " current" : ""}`}>
          {title}
        </Link>
        <form className="side-search" action={homeHref}>
          <input type="hidden" name="view" value="search" />
          <input name="q" placeholder="검색" aria-label="일기 검색" />
        </form>
        <Link href={`${homeHref}?view=calendar`} className="side-cal small">
          📅 캘린더
        </Link>
        <Branch nodes={tree} pathname={pathname} />
      </nav>
    </>
  );
}
