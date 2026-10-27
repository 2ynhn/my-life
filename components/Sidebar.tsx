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
            {node.private && (
              <span className="lock" title="비공개: 게스트에게 안 보임" aria-label="비공개">
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

export function Sidebar({ tree }: { tree: TreeNode[] }) {
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
        <Link href="/" className={`home${pathname === "/" ? " current" : ""}`}>
          my-life
        </Link>
        <Branch nodes={tree} pathname={pathname} />
      </nav>
    </>
  );
}
