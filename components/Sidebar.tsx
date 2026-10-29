"use client";

import { ArrowLeft, CalendarDays, ExternalLink, Folder, HeartPulse, Layers, Lock, Menu, NotebookPen, Plane, Receipt, Settings, Sparkles, X, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshButton } from "@/components/RefreshButton";
import type { TreeNode } from "@/lib/drive";
import { featureByName } from "@/lib/features";

function isWithin(pathname: string, href: string) {
  const p = decodeURIComponent(pathname);
  const h = decodeURIComponent(href);
  return p === h || p.startsWith(h + "/");
}

function Branch({ nodes, pathname, top = false }: { nodes: TreeNode[]; pathname: string; top?: boolean }) {
  return (
    <ul>
      {nodes.map((node) => {
        const active = isWithin(pathname, node.href);
        const current = decodeURIComponent(pathname) === decodeURIComponent(node.href);
        const link = (
          <Link href={node.href} className={current ? "current" : undefined} aria-current={current ? "page" : undefined}>
            {top && <SideIcon name={node.name} />}
            {node.name}
            {node.restricted && (
              <span className="lock" title="접근 제한: 상위 폴더를 공유받은 사람도 볼 수 없음" aria-label="접근 제한">
                <Lock size={12} aria-hidden />
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

/** 일기장 하나의 메뉴: 검색·도구·폴더 트리, 아래에 Drive에서 열기·설정·다시 불러오기. 모바일에서는 왼쪽 서랍 */
export function Sidebar({ tree, homeHref, driveHref }: { tree: TreeNode[]; homeHref: string; driveHref: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // 모바일 메뉴 버튼은 머리줄 왼쪽 자리에 넣는다
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById("nav-slot")), []);
  const toggle = (
    <button className="menu-toggle" aria-expanded={open} aria-label="메뉴 열기" onClick={() => setOpen(true)}>
      <Menu size={22} aria-hidden />
    </button>
  );

  return (
    <>
      {slot && createPortal(toggle, slot)}
      {open && <button className="side-scrim" aria-label="메뉴 닫기" onClick={() => setOpen(false)} />}
      <nav
        className={`sidebar${open ? " open" : ""}`}
        aria-label="메뉴"
        // 모바일: 링크를 누르면 메뉴를 닫는다
        onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}
      >
        <div className="side-top">
          <Link href="/libraries" className="libs small muted">
            <ArrowLeft size={14} aria-hidden /> 일기장 목록
          </Link>
          <button className="side-close" aria-label="메뉴 닫기" onClick={() => setOpen(false)}>
            <X size={22} aria-hidden />
          </button>
        </div>
        <form className="side-search" action={homeHref}>
          <input type="hidden" name="view" value="search" />
          <input name="q" placeholder="검색" aria-label="일기 검색" />
        </form>
        <div className="side-tools">
          <Link href={`${homeHref}?view=calendar`} className="side-cal">
            <CalendarDays size={15} aria-hidden />
            캘린더
          </Link>
          <Link href={`${homeHref}?view=collect`} className="side-cal">
            <Layers size={15} aria-hidden />
            모아보기
          </Link>
          <Link href={`${homeHref}?view=ask`} className="side-cal">
            <Sparkles size={15} aria-hidden />
            물어보기
          </Link>
        </div>
        <Branch nodes={tree} pathname={pathname} top />
        <div className="side-foot">
          <a href={driveHref} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} aria-hidden />
            Drive에서 열기
          </a>
          <Link href="/settings">
            <Settings size={16} aria-hidden />
            설정
          </Link>
          <RefreshButton />
        </div>
      </nav>
    </>
  );
}

const SIDE_ICONS = { diary: NotebookPen, spending: Receipt, travel: Plane, health: HeartPulse, food: UtensilsCrossed };

/** 최상위 폴더 앞 아이콘 (이름으로만 판단 — 사이드바는 템플릿을 읽지 않는다) */
function SideIcon({ name }: { name: string }) {
  const key = featureByName(name);
  const Icon = key ? SIDE_ICONS[key] : Folder;
  return <Icon size={15} strokeWidth={1.75} className={`side-icon side-${key ?? "folder"}`} aria-hidden />;
}
