"use client";

import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import type { Editor as EditorType } from "@/components/Editor";
import { useLocal } from "@/components/LocalData";
import { linkTableFor, topOf } from "@/components/LocalPreview";
import type { FormKind } from "@/components/MetaForm";
import { normHref, type LocalState } from "@/lib/local-store";
import type { LocalEntry } from "@/lib/local-types";
import { BUILTIN_TEMPLATES, DEFAULT_TEMPLATE, TEMPLATE_FOLDER, withEnd } from "@/lib/templates";
import { todayKST } from "@/lib/today";

// 편집·새 글을 누르는 순간: 서버에 묻지 않고 기기 사본(글·템플릿)으로 편집기를 바로 연다.
// 주소는 history.pushState로만 바꿔(서버 요청 없음) 뒤로 가기·새로고침도 그대로 된다.
// 사본에 필요한 것(글 내용·체크섬·템플릿)이 없으면 손대지 않아 평소처럼 서버 화면으로 간다.

type EditorProps = ComponentProps<typeof EditorType>;

// 편집기(CodeMirror)는 무거워 모든 화면에 싣지 않고 따로 받는다. 앱을 열면 한가할 때 미리 받아 둔다
const loadEditor = () => import("@/components/Editor").then((m) => m.Editor);
const Editor = dynamic(loadEditor, { ssr: false });

const keyOf = (pathname: string, search: string) => `${normHref(pathname)}?${new URLSearchParams(search).toString()}`;

function kindOf(local: LocalState, e: LocalEntry): FormKind | null {
  return (local.tree.kinds[topOf(local, e).id] ?? null) as FormKind | null;
}

/** 서버 loadTemplate과 같은 순서: _templates/<맨 위 폴더>.md → 내장 → _templates/default.md → 기본. 사본에 없으면 null */
function templateFor(local: LocalState, folder: LocalEntry): string | null {
  const top = topOf(local, folder);
  const builtin = (top.p && BUILTIN_TEMPLATES[top.n.toLowerCase()]) || DEFAULT_TEMPLATE;
  const root = local.tree.entries.find((e) => !e.p);
  const templates = root && (local.children.get(root.id) ?? []).find((c) => c.k === "d" && c.n === TEMPLATE_FOLDER);
  const pick = (name: string) =>
    templates ? (local.children.get(templates.id) ?? []).find((c) => c.k === "f" && c.n.toLowerCase() === name.toLowerCase()) : undefined;
  const text = (e: LocalEntry) => local.texts.get(e.id)?.t ?? null;
  const own = top.p ? pick(`${top.n}.md`) : undefined;
  if (own) return text(own);
  if (builtin !== DEFAULT_TEMPLATE) return builtin;
  const fallback = pick("default.md");
  return fallback ? text(fallback) : DEFAULT_TEMPLATE;
}

function freeName(local: LocalState, folder: LocalEntry, base: string) {
  const taken = new Set((local.children.get(folder.id) ?? []).map((c) => c.n.toLowerCase()));
  for (let i = 1; ; i++) {
    const name = i === 1 ? base : `${base}-${i}`;
    if (!taken.has(`${name}.md`.toLowerCase())) return name;
  }
}

/** 이 주소의 편집기를 사본으로 열 수 있으면 그 props (페이지 서버 화면 EditNote·NewNote와 같은 값) */
export function localEditorProps(local: LocalState | null, pathname: string, search: string): EditorProps | null {
  if (!local) return null;
  const sp = new URLSearchParams(search);
  const mode = sp.get("mode");
  const entry = local.byHref.get(normHref(pathname));
  if (!entry || (mode !== "edit" && mode !== "new") || sp.has("sub")) return null;
  const root = local.tree.entries.find((e) => !e.p);
  const photo = sp.get("photo");
  const insertPhoto = photo && photo.length <= 200 ? photo : undefined;
  const shared = sp.get("shared");

  if (mode === "edit") {
    const t = local.texts.get(entry.id);
    const parent = entry.p ? local.byId.get(entry.p) : undefined;
    if (entry.k !== "f" || !entry.md || !entry.e || !t?.c || !parent) return null;
    const form = kindOf(local, entry);
    return {
      mode: "edit",
      fileId: entry.id,
      fileName: entry.n,
      checksum: t.c,
      initialText: t.t,
      rootId: local.tree.rootId,
      places: form === "travel" || form === "food",
      form,
      manageCategories: !!root?.a,
      sharedPhotos: shared === "photos",
      insertPhoto,
      closeHref: entry.h,
      doneHref: form === "diary" ? local.tree.base : parent.h,
      uploadFolderId: parent.id,
      links: linkTableFor(local, entry),
    };
  }

  if (entry.k !== "d" || !entry.a || !entry.p) return null;
  const template = templateFor(local, entry);
  if (template === null) return null;
  const rawDate = sp.get("date");
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayKST();
  const rawEnd = sp.get("end");
  const end = rawDate && rawEnd && /^\d{4}-\d{2}-\d{2}$/.test(rawEnd) && rawEnd > date ? rawEnd : undefined;
  const kind = kindOf(local, entry);
  return {
    mode: "new",
    receipt: kind === "spending",
    sharedImage: shared === "1" && kind === "spending",
    sharedPhotos: shared === "photos",
    insertPhoto,
    places: kind === "travel" || kind === "food",
    form: kind,
    manageCategories: kind === "spending" && !!root?.a,
    doneHref: kind === "diary" ? local.tree.base : undefined,
    rootId: local.tree.rootId,
    folderId: entry.id,
    folderName: entry.n,
    defaultName: freeName(local, entry, date),
    initialText: withEnd(template.replaceAll("{{date}}", date).replaceAll("{{title}}", ""), end),
    closeHref: entry.h,
    uploadFolderId: entry.id,
    links: linkTableFor(local, { p: entry.id }),
  };
}

export function LocalEditorHost() {
  const local = useLocal();
  const localRef = useRef(local);
  useEffect(() => {
    localRef.current = local;
  }, [local]);
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const here = keyOf(pathname, search);
  // armed: 주소가 이 편집기 주소로 바뀐 뒤 (그 전에는 아직 바뀌는 중)
  const [open, setOpen] = useState<{ key: string; props: EditorProps; armed: boolean } | null>(null);
  if (open) {
    if (here === open.key) {
      if (!open.armed) setOpen({ ...open, armed: true });
    } else if (open.armed) setOpen(null); // 저장·닫기·뒤로 가기로 다른 화면
  }

  useEffect(() => {
    // 화면이 다 그려지고 한가해지면 바로 (편집을 누르기 전에 받아 두게)
    const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200));
    idle(() => void loadEditor());
  }, []);

  useEffect(() => {
    // 링크(next/link)보다 먼저: 캡처 단계에서 가로채면 Link는 이동하지 않는다
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      const props = localEditorProps(localRef.current, url.pathname, url.search.slice(1));
      if (!props) return;
      e.preventDefault();
      setOpen({ key: keyOf(url.pathname, url.search.slice(1)), props, armed: false });
      window.history.pushState(null, "", url.pathname + url.search);
      window.scrollTo(0, 0);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (!open) return null;
  return (
    <div className="local-editor">
      <Editor key={open.key} {...open.props} onLeave={() => setOpen(null)} />
    </div>
  );
}
