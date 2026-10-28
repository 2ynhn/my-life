"use client";

import { CalendarDays, House, Layers, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// 모바일 하단 탭: 일기장 첫 화면·검색·캘린더·모아보기. 글을 쓰는 중(mode=new/edit)에는 숨긴다.

export function TabBar({ base }: { base: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  if (params.get("mode")) return null;

  const atRoot = decodeURIComponent(pathname) === decodeURIComponent(base);
  const view = atRoot ? params.get("view") : null;
  const tabs = [
    { href: base, label: "홈", Icon: House, on: atRoot && !view },
    { href: `${base}?view=search`, label: "검색", Icon: Search, on: view === "search" || view === "ask" },
    { href: `${base}?view=calendar`, label: "캘린더", Icon: CalendarDays, on: view === "calendar" },
    { href: `${base}?view=collect`, label: "모아보기", Icon: Layers, on: view === "collect" },
  ];

  return (
    <nav className="tabbar" aria-label="주 메뉴">
      {tabs.map(({ href, label, Icon, on }) => (
        <Link key={label} href={href} className={on ? "on" : undefined} aria-current={on ? "page" : undefined}>
          <Icon size={22} strokeWidth={on ? 2 : 1.75} aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}
