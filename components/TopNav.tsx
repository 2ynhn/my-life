"use client";

import { ArrowLeft, BookHeart } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { featureByName, featureOf } from "@/lib/features";

// 상단 내비게이션: ← 위로 + 지금 화면 이름.
// '뒤로'는 지나온 화면이 아니라 폴더 트리의 한 단계 위로 간다 (글 → 그 폴더 → 상위 폴더 → 첫 화면).

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** 주소만으로 위 단계와 제목을 정한다 */
function place(pathname: string, params: URLSearchParams): { up: string | null; title: string | null } {
  const segs = pathname.split("/").filter(Boolean);
  const mode = params.get("mode");
  const view = params.get("view");
  if (segs[0] === "settings") return { up: "/", title: "설정" };
  if (segs[0] === "libraries") return { up: null, title: "일기장 목록" };
  if (segs[0] === "share") return { up: "/", title: "공유받은 내용" };
  if (segs[0] !== "d" || segs.length < 2) return { up: null, title: null };

  const rest = segs.slice(2).map(decode);
  const here = rest.at(-1);
  const name = here && rest.length === 1 && featureByName(here) ? featureOf(featureByName(here)!).label : here;
  // 편집·새 글·검색·캘린더는 같은 주소의 기본 화면이 위 단계
  if (mode === "new") return { up: pathname, title: "새 글" };
  if (mode === "edit") return { up: pathname, title: name ?? null };
  if (view === "search") return { up: pathname, title: params.get("tag") ? `#${params.get("tag")}` : "검색" };
  if (view === "calendar") return { up: pathname, title: "캘린더" };
  if (view === "collect") {
    // 사람·가게 하나를 보고 있으면 그 목록이 위 단계
    const sub = params.get("who") ?? params.get("store");
    if (sub) return { up: `${pathname}?view=collect&tab=${params.get("tab") ?? "people"}`, title: sub };
    return { up: pathname, title: "모아보기" };
  }
  if (view === "ask") return { up: pathname, title: "물어보기" };
  if (!rest.length) return { up: null, title: null }; // 일기장 첫 화면
  return { up: "/" + segs.slice(0, -1).join("/"), title: name ?? null };
}

/** 위 단계 이름 (버튼 설명용) */
function upLabel(up: string): string {
  const segs = up.split("?")[0].split("/").filter(Boolean);
  if (up === "/" || (segs[0] === "d" && segs.length <= 2 && !up.includes("?"))) return "첫 화면";
  if (up.includes("?view=collect")) return "모아보기";
  const last = decode(segs.at(-1) ?? "");
  const key = segs.length === 3 ? featureByName(last) : null;
  return key ? featureOf(key).label : last;
}

export function TopNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const { up, title } = place(pathname, params);

  if (!up) {
    // 첫 화면은 제목 없이 (일기장 이름은 본문 제목에 있다)
    if (!title) return null;
    return (
      <Link href="/" className="brand">
        <BookHeart size={20} strokeWidth={1.75} aria-hidden />
        {title}
      </Link>
    );
  }
  const label = upLabel(up);
  return (
    <div className="nav-title">
      <Link href={up} className="nav-back" aria-label={`위로: ${label}`} title={`${label}(으)로`}>
        <ArrowLeft size={20} aria-hidden />
      </Link>
      <span className="nav-name">{title}</span>
    </div>
  );
}
