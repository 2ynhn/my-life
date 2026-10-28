"use client";

import { ArrowLeft, BookHeart } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { featureByName, featureOf } from "@/lib/features";

// 상단 내비게이션: ← 뒤로 + 지금 화면 이름.
// 뒤로는 앱 안에서 온 화면이 있으면 그 화면으로(브라우저 뒤로와 같음), 없으면(주소로 바로 들어옴) 한 단계 위 폴더로.

const STACK = "my-life:nav";

function readStack(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(STACK) ?? "[]") as string[];
  } catch {
    return [];
  }
}
function writeStack(stack: string[]) {
  try {
    sessionStorage.setItem(STACK, JSON.stringify(stack.slice(-50)));
  } catch {}
}

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
  if (view === "collect") return { up: pathname, title: "모아보기" };
  if (view === "ask") return { up: pathname, title: "물어보기" };
  if (!rest.length) return { up: null, title: null }; // 일기장 첫 화면
  return { up: "/" + segs.slice(0, -1).join("/"), title: name ?? null };
}

export function TopNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const url = `${pathname}?${params}`;
  const { up, title } = place(pathname, params);

  // 앱 안에서 지나온 화면 기록 (브라우저 뒤로 가기도 반영: 바로 전 화면으로 돌아오면 하나 뺀다)
  useEffect(() => {
    const stack = readStack();
    if (stack.at(-1) === url) return;
    if (stack.at(-2) === url) stack.pop();
    else stack.push(url);
    writeStack(stack);
  }, [url]);

  const back = () => {
    if (readStack().length > 1) router.back();
    else if (up) {
      writeStack([]);
      router.push(up);
    }
  };

  if (!up) {
    return (
      <Link href="/" className="brand">
        <BookHeart size={20} strokeWidth={1.75} aria-hidden />
        {title ?? "my-life"}
      </Link>
    );
  }
  return (
    <div className="nav-title">
      <button className="nav-back" onClick={back} aria-label="뒤로" title="뒤로">
        <ArrowLeft size={20} aria-hidden />
      </button>
      <span className="nav-name">{title}</span>
    </div>
  );
}
