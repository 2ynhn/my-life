"use client";

import { Camera, ClipboardPaste, ImagePlus, ImageUp, MapPinPlus } from "lucide-react";
import { markdown } from "@codemirror/lang-markdown";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { tags as t } from "@lezer/highlight";
import { EditorView, placeholder } from "@codemirror/view";
import { minimalSetup } from "codemirror";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { MetaForm, type FormKind, type Suggestions } from "@/components/MetaForm";
import { NoteBody } from "@/components/NoteBody";
import { PlacePicker } from "@/components/PlacePicker";
import { ReceiptCamera } from "@/components/ReceiptCamera";
import { addPlace, readMeta, setFields } from "@/lib/frontmatter-edit";
import { reverseName } from "@/lib/geo-name";
import { imageFiles, prepareImage, uploadImage } from "@/lib/image-upload";
import { tableResolver, type LinkTable } from "@/lib/markdown";
import { enqueue, onResult, pendingSave, readDraft, writeDraft, type Draft } from "@/lib/save-queue";
import { takeSharedImages } from "@/lib/share-store";
import { autoNoteName } from "@/lib/note-name";
import { fillReceipt, receiptFileName, type Receipt } from "@/lib/receipt-shape";
import { addCategory as addCategoryAction } from "@/app/(app)/budget-actions";

type Props = {
  links: LinkTable;
  initialText: string;
  /** 취소·닫기 시 돌아갈 주소 */
  closeHref: string;
  /** 저장(만들기)을 마치면 돌아갈 곳: 일기는 첫 화면, 나머지는 그 폴더 (새 글은 없으면 만든 폴더) */
  doneHref?: string;
  /** 이 글이 있는 일기장 (Drive 폴더 id) */
  rootId: string;
  /** 사진을 올릴 때 기준이 되는 노트 폴더 (가장 가까운 attachments 폴더에 저장) */
  uploadFolderId: string;
  /** 여행 폴더면 '장소 추가' 버튼을 보인다 */
  places?: boolean;
  /** 카테고리별 입력 폼 (일기는 쓰기 위에 키워드 줄, 나머지는 '항목' 탭) */
  form?: FormKind | null;
  /** 구매 분류를 폼에서 바로 더할 수 있는지 (일기장 설정 권한) */
  manageCategories?: boolean;
  /** 휴대폰 '공유하기'로 받은 사진들을 열자마자 글 끝에 넣는다 (일기·여행) */
  sharedPhotos?: boolean;
  /** 이미 올려 둔 사진을 열자마자 글 끝에 넣는다 (여행 사진으로 일기 쓰기) */
  insertPhoto?: string;
} & (
  | { mode: "edit"; fileId: string; fileName: string; checksum: string }
  | {
      mode: "new";
      folderId: string;
      folderName: string;
      defaultName: string;
      subfolder?: string;
      /** 지출 기록 폴더면 '영수증으로 채우기' 버튼을 보인다 */
      receipt?: boolean;
      /** 휴대폰 '공유하기'로 받은 이미지를 열자마자 영수증으로 읽는다 */
      sharedImage?: boolean;
    }
);

/** 글쓰기용 차분한 강조: 제목은 굵게만, 밑줄 없음 */
const proseHighlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: "700", fontSize: "1.25em" },
  { tag: [t.heading2, t.heading3, t.heading4, t.heading5, t.heading6], fontWeight: "700" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: [t.link, t.url], color: "var(--accent)" },
  { tag: t.monospace, fontFamily: "ui-monospace, monospace", fontSize: "0.92em" },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator, t.quote], color: "var(--muted)" },
  // frontmatter(YAML)
  { tag: [t.propertyName, t.definition(t.propertyName)], color: "var(--muted)" },
  { tag: [t.string, t.number, t.bool, t.keyword], color: "var(--text)" },
]);

const editorTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "1rem", backgroundColor: "var(--surface)", color: "var(--text)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font)", lineHeight: "1.75", overflow: "auto" },
  ".cm-content": { padding: "1rem", caretColor: "var(--accent)" },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
  ".cm-placeholder": { color: "var(--muted)" },
});

const fmtTime = (t: number) => new Date(t).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });

export function Editor(props: Props) {
  const router = useRouter();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // 편집기가 다시 만들어져도(개발 모드의 두 번 마운트 등) 지금까지의 내용으로 시작하게
  const latestText = useRef(props.initialText);
  const saveRef = useRef<() => void>(() => {});
  const uploadRef = useRef<(files: File[]) => Promise<void> | void>(() => {});
  // 붙여넣은 이미지: 구매 새 글이면 영수증으로 읽고, 아니면 사진으로 올린다
  const pasteRef = useRef<(files: File[]) => void>(() => {});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);
  const [attachReceipt, setAttachReceipt] = useState(false);
  const [picker, setPicker] = useState(false);

  const draftKey = props.mode === "edit" ? `my-life:draft:${props.fileId}` : `my-life:draft:new:${props.folderId}`;

  const [text, setText] = useState(props.initialText);
  const [savedText, setSavedText] = useState(props.initialText);
  const [checksum, setChecksum] = useState(props.mode === "edit" ? props.checksum : "");
  const [name, setName] = useState(props.mode === "new" ? props.defaultName : "");
  // 이름을 직접 고치기 전까지는 날짜·가게·식당·여행 이름을 따라 자동으로
  const [nameAuto, setNameAuto] = useState(props.mode === "new");
  // 저장을 눌러 넘겼으면 임시저장을 더 하지 않는다 (화면이 바뀌기 전에 타이머가 돌아도)
  const submitted = useRef(false);
  // ok: 저장됨(다시 고치면 사라짐) · info: 안내(고쳐도 남음) · error
  const [message, setMessage] = useState<{ kind: "ok" | "info" | "error"; text: string } | null>(null);
  const [conflict, setConflict] = useState<{ text: string; checksum: string } | null>(null);
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);
  const tabbedForm = props.form && props.form !== "diary" ? props.form : null;
  const [tab, setTab] = useState<"form" | "write" | "preview">(tabbedForm ? "form" : "write");
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  // 이번에 올린 사진: 미리보기에서 바로 보이도록 링크 표에 더한다
  const [uploaded, setUploaded] = useState<Record<string, string>>({});

  const dirty = props.mode === "new" ? text.trim() !== "" && text !== props.initialText : text !== savedText;
  const previewText = useDeferredValue(text);
  const resolver = useMemo(
    () => tableResolver({ ...props.links, attachments: { ...props.links.attachments, ...uploaded } }),
    [props.links, uploaded],
  );

  const replaceDoc = useCallback((next: string, focus = true) => {
    const view = viewRef.current;
    if (view) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
      if (focus) view.focus();
    }
    setText(next);
  }, []);

  // 폼의 자동 완성: 이 일기장에서 자주 쓴 키워드·사람·가게·결제 수단
  useEffect(() => {
    if (!props.form) return;
    let cancelled = false;
    fetch(`/api/suggest?root=${encodeURIComponent(props.rootId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Suggestions>) : null))
      .then((s) => !cancelled && s && setSuggestions(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [props.form, props.rootId]);

  // CodeMirror 생성 (한 번만)
  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      doc: latestText.current,
      parent: hostRef.current,
      extensions: [
        minimalSetup,
        yamlFrontmatter({ content: markdown({ codeLanguages: languages }) }),
        syntaxHighlighting(proseHighlight),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ spellcheck: "false", autocapitalize: "off" }),
        placeholder("여기에 쓰세요…"),
        editorTheme,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            latestText.current = u.state.doc.toString();
            setText(latestText.current);
          }
        }),
        // 사진 붙여넣기·끌어다 놓기
        EditorView.domEventHandlers({
          paste(e) {
            const files = imageFiles(e.clipboardData?.files);
            if (!files.length) return false;
            e.preventDefault();
            pasteRef.current(files);
            return true;
          },
          drop(e, view) {
            const files = imageFiles(e.dataTransfer?.files);
            if (!files.length) return false;
            e.preventDefault();
            const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
            if (pos !== null) view.dispatch({ selection: { anchor: pos } });
            uploadRef.current(files);
            return true;
          },
        }),
      ],
    });
    viewRef.current = view;
    view.focus();
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 앞서 저장한 내용이 아직 Drive로 가는 중이면 그 내용으로 시작한다
  useEffect(() => {
    if (props.mode !== "edit") return;
    const job = pendingSave(props.fileId);
    if (!job || job.text === latestText.current) return;
    replaceDoc(job.text, false);
    setSavedText(job.text);
    setMessage({ kind: "info", text: "앞서 저장한 내용을 Drive에 올리는 중이에요." });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 저장 안 된 임시본이 있으면 복원할지 묻는다
  useEffect(() => {
    const draft = readDraft(draftKey);
    if (draft && draft.text !== props.initialText) setPendingDraft(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // 입력이 멈추면 1초 뒤 브라우저에 임시저장
  useEffect(() => {
    if (!dirty || pendingDraft) return;
    const t = setTimeout(() => {
      if (!submitted.current) writeDraft(draftKey, { text, name: name || undefined, at: Date.now() });
    }, 1000);
    return () => clearTimeout(t);
  }, [dirty, text, name, draftKey, pendingDraft]);

  // Ctrl/Cmd+S: 편집기 밖(파일 이름 칸, 버튼)에 포커스가 있어도 저장
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 저장 안 하고 나가려 하면 경고
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // 저장: 뒤에서 보내는 줄(lib/save-queue)에 넣고 기다리지 않는다. 끝나면 결과가 아래 onResult로 온다
  const save = useCallback(
    (force = false, leave = false) => {
      setMessage(null);
      const current = viewRef.current?.state.doc.toString() ?? text;
      if (props.mode === "edit") {
        enqueue({
          op: "save",
          rootId: props.rootId,
          fileId: props.fileId,
          checksum,
          force,
          text: current,
          label: props.fileName,
          draftKey,
          reopenHref: `${props.closeHref}?mode=edit`,
        });
        setSavedText(current);
        setConflict(null);
        if (leave) {
          submitted.current = true;
          return router.push(props.doneHref ?? props.closeHref);
        }
        setMessage({ kind: "info", text: "저장 중…" });
        return;
      }
      const base = name.trim().replace(/\.md$/i, "").trim();
      if (!base) return setMessage({ kind: "error", text: "파일 이름을 입력하세요." });
      if (/[\/\\\x00-\x1f]/.test(base) || base.startsWith("."))
        return setMessage({ kind: "error", text: "파일 이름에 / \\ 나 맨 앞 . 은 쓸 수 없습니다." });
      enqueue({
        op: "create",
        rootId: props.rootId,
        folderId: props.folderId,
        name: base,
        subfolder: props.subfolder,
        autoName: nameAuto,
        text: current,
        label: `${base}.md`,
        draftKey,
        reopenHref: `${props.closeHref}?mode=new${props.subfolder ? `&sub=${props.subfolder}` : ""}`,
      });
      submitted.current = true;
      setSavedText(current);
      // 일기는 첫 화면, 나머지는 그 폴더로 바로 (목록에는 '저장 중'으로 보이다가 끝나면 채워진다)
      router.push(props.doneHref ?? props.closeHref);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, checksum, name, nameAuto, draftKey],
  );

  // 이 글의 저장 결과: checksum을 이어 받고, 충돌이면 알려 준다
  const fileId = props.mode === "edit" ? props.fileId : null;
  useEffect(() => {
    if (!fileId) return;
    return onResult((job, result) => {
      if (job.fileId !== fileId) return;
      if (result.ok) {
        if (result.checksum) setChecksum(result.checksum);
        setMessage({ kind: "ok", text: `저장됨 · ${fmtTime(Date.now())}` });
      } else {
        setConflict(result.conflict ?? null);
        setMessage({ kind: "error", text: result.error });
      }
    });
  }, [fileId]);

  saveRef.current = () => void save();

  const autoName = props.mode === "new" && nameAuto ? autoNoteName(text, props.form, props.defaultName) : null;
  useEffect(() => {
    if (autoName && autoName !== name) setName(autoName);
  }, [autoName, name]);

  // 한 장씩 차례로 올리고, 올라갈 때마다 커서 자리에 ![[이름]] 을 넣는다
  uploadRef.current = async (files: File[]) => {
    if (uploading) return;
    setMessage(null);
    const found: { lat?: number; lng?: number; taken?: string }[] = [];
    try {
      for (const [i, file] of files.entries()) {
        setUploading(files.length > 1 ? `사진 올리는 중… (${i + 1}/${files.length})` : "사진 올리는 중…");
        const { name, url, exif } = await uploadImage(file, props.rootId, props.uploadFolderId);
        if (exif) found.push(exif);
        setUploaded((prev) => ({ ...prev, [name.toLowerCase()]: url }));
        const view = viewRef.current;
        if (view) {
          // 커서가 맨 앞이나 앞머리(--- 사이)에 있으면(항목 탭에서 올린 경우 등) 글 끝에 넣는다 — 앞머리가 깨지지 않게
          const doc = view.state.doc.toString();
          const front = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(doc);
          if (view.state.selection.main.from < (front ? front[0].length : 1)) view.dispatch({ selection: { anchor: doc.length } });
          const { from } = view.state.selection.main;
          const before = from > 0 ? view.state.sliceDoc(from - 1, from) : "\n";
          const insert = `${before === "\n" ? "" : "\n"}![[${name}]]\n`;
          view.dispatch(view.state.replaceSelection(insert));
          if (tab === "write") view.focus();
        }
      }
      if (props.form === "food") await fillFoodFromPhotos(found);
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "사진을 올리지 못했습니다." });
    } finally {
      setUploading(null);
    }
  };

  // 음식: 사진의 찍은 곳으로 장소(비어 있을 때), 찍은 날로 날짜(새 글이고 손대지 않았을 때)
  const fillFoodFromPhotos = async (found: { lat?: number; lng?: number; taken?: string }[]) => {
    const view = viewRef.current;
    if (!view) return;
    let doc = view.state.doc.toString();
    const meta = readMeta(doc);
    if (!meta) return;
    const fields: Record<string, string | Record<string, unknown>> = {};
    const geo = found.find((e) => e.lat !== undefined && e.lng !== undefined);
    if (geo && !(meta.place && typeof meta.place === "object")) {
      setUploading("사진 찍은 곳 찾는 중…");
      const named = await reverseName(geo.lat!, geo.lng!);
      fields.place = { name: named?.name ?? "사진 찍은 곳", lat: geo.lat!, lng: geo.lng! };
      // 식당 이름이 비어 있고 그 자리가 식당·카페면 이름도
      if (named?.isEatery && !String(meta.restaurant ?? "").trim()) fields.restaurant = named.name;
    }
    const day = found.find((e) => e.taken)?.taken?.slice(0, 10);
    if (props.mode === "new" && day && String(meta.date ?? "") === props.defaultName.slice(0, 10) && day !== props.defaultName.slice(0, 10)) {
      fields.date = day;
      if (name === props.defaultName) setName(day);
    }
    if (!Object.keys(fields).length) return;
    doc = setFields(view.state.doc.toString(), fields);
    replaceDoc(doc, false);
    setMessage({ kind: "info", text: fields.place ? `사진 찍은 곳(${(fields.place as { name: string }).name})을 장소에 넣었어요.` : "사진 찍은 날로 날짜를 바꿨어요." });
  };

  // 영수증: 카메라로 찍거나 고른 이미지를 메모리에서 바로 서버로 보내 Claude로 읽고, 템플릿 앞머리를 채운다.
  // 파일은 만들지 않는다. '이미지도 글에 첨부'를 켰을 때만 attachments에 올린다. 저장은 직접 확인 후
  const readReceiptImage = async (image: Blob) => {
    if (uploading || props.mode !== "new") return;
    setMessage(null);
    setCamera(false);
    try {
      setUploading("영수증 읽는 중… (10~30초)");
      const res = await fetch(`/api/receipt?root=${encodeURIComponent(props.rootId)}`, {
        method: "POST",
        headers: { "Content-Type": image.type || "image/jpeg" },
        body: image,
      });
      const body = (await res.json().catch(() => ({}))) as { receipt?: Receipt; error?: string };
      if (!res.ok || !body.receipt) throw new Error(body.error ?? `영수증을 읽지 못했습니다 (${res.status})`);

      let attached: string | undefined;
      if (attachReceipt) {
        setUploading("영수증 이미지 올리는 중…");
        const file = new File([image], "receipt.jpg", { type: image.type || "image/jpeg" });
        const up = await uploadImage(file, props.rootId, props.uploadFolderId);
        setUploaded((prev) => ({ ...prev, [up.name.toLowerCase()]: up.url }));
        attached = up.name;
      }
      const current = viewRef.current?.state.doc.toString() ?? text;
      replaceDoc(fillReceipt(current, body.receipt, attached));
      const suggested = receiptFileName(body.receipt, props.defaultName.slice(0, 10));
      if (suggested) setName(suggested);
      setMessage({ kind: "info", text: "영수증 내용을 채웠어요. 확인하고 고친 뒤 '만들기'를 누르세요." });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "영수증을 읽지 못했습니다." });
    } finally {
      setUploading(null);
    }
  };

  // 장소: 앞머리 places 목록 끝에 한 줄 더한다 (날짜는 오늘)
  const insertPlace = (p: { name: string; lat: number; lng: number }) => {
    setPicker(false);
    const current = viewRef.current?.state.doc.toString() ?? text;
    try {
      const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
      const round = (n: number) => Math.round(n * 1e5) / 1e5;
      replaceDoc(
        props.form === "food"
          ? setFields(current, { place: { name: p.name, lat: round(p.lat), lng: round(p.lng) } })
          : addPlace(current, { ...p, date }),
      );
      setMessage({ kind: "info", text: `'${p.name}'을(를) 장소 목록에 넣었어요. 날짜가 다르면 고쳐 주세요.` });
    } catch {
      setMessage({ kind: "error", text: "앞머리(--- 사이)를 읽지 못해 장소를 넣지 못했습니다. 형식을 확인해 주세요." });
    }
  };

  // 공유받은 이미지: 브라우저 안에 잠깐 둔 것을 꺼내(꺼내면 지움)
  // 구매는 첫 장을 영수증으로 읽고, 일기·여행은 사진으로 글 끝에 넣는다
  const sharedTaken = useRef(false);
  useEffect(() => {
    const receipt = props.mode === "new" && props.sharedImage;
    if ((!receipt && !props.sharedPhotos) || sharedTaken.current) return;
    sharedTaken.current = true;
    void (async () => {
      const blobs = await takeSharedImages();
      if (!blobs.length)
        return setMessage({ kind: "info", text: receipt ? "공유받은 이미지가 없어요. '이미지로 읽기'로 골라 주세요." : "공유받은 사진이 없어요. '사진' 버튼으로 넣어 주세요." });
      if (receipt) {
        try {
          void readReceiptImage(await prepareImage(new File([blobs[0]], "shared", { type: blobs[0].type || "image/png" })));
        } catch (e) {
          setMessage({ kind: "error", text: e instanceof Error ? e.message : "이미지를 열지 못했습니다." });
        }
        return;
      }
      const view = viewRef.current;
      if (view) view.dispatch({ selection: { anchor: view.state.doc.length } });
      await uploadRef.current(blobs.map((b, i) => new File([b], `shared-${i + 1}`, { type: b.type || "image/jpeg" })));
      setMessage({ kind: "info", text: `사진 ${blobs.length}장을 글 끝에 넣었어요. 확인하고 저장하세요.` });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 여행 사진으로 일기 쓰기: 그 사진 링크를 글 끝에 (이미 있으면 그대로)
  const photoInserted = useRef(false);
  useEffect(() => {
    const name = props.insertPhoto;
    const view = viewRef.current;
    if (!name || !view || photoInserted.current) return;
    photoInserted.current = true;
    const doc = view.state.doc.toString();
    if (doc.includes(`![[${name}]]`)) return;
    const insert = `${doc.endsWith("\n") ? "" : "\n"}\n![[${name}]]\n`;
    view.dispatch({ changes: { from: doc.length, insert }, selection: { anchor: doc.length + insert.length } });
    setMessage({ kind: "info", text: "사진을 넣었어요. 그날 이야기를 쓰고 저장하세요." });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 폼의 '+ 분류 추가': 분류 관리 목록 끝에 더해 저장
  const addCategory = async (name: string): Promise<string | null> => {
    try {
      const res = await addCategoryAction(props.rootId, name);
      if (!res.ok) return res.error;
      setSuggestions((s) => ({ ...(s ?? { tags: [], people: [], stores: [], payments: [] }), categories: res.categories }));
      return null;
    } catch {
      return "서버에 연결하지 못했습니다.";
    }
  };

  // 고른·붙여넣은 이미지(스크린샷 등)를 줄여서 영수증으로 읽는다 (서버 한도 4MB)
  const receiptFromImage = async (image: Blob) => {
    try {
      const file = image instanceof File ? image : new File([image], "clipboard", { type: image.type || "image/png" });
      void readReceiptImage(await prepareImage(file));
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "이미지를 열지 못했습니다." });
    }
  };
  const receiptMode = props.mode === "new" && !!props.receipt;
  pasteRef.current = (files) => (receiptMode ? void receiptFromImage(files[0]) : uploadRef.current(files));

  // 편집기 밖(폼 칸 등)에 포커스가 있어도 Ctrl+V 스크린샷을 영수증으로
  useEffect(() => {
    if (!receiptMode) return;
    const onPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented) return; // 편집기가 이미 처리함
      const files = imageFiles(e.clipboardData?.files);
      if (!files.length) return;
      e.preventDefault();
      pasteRef.current(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [receiptMode]);

  // '클립보드에서 읽기' 버튼: 브라우저가 클립보드 읽기를 허락할 때
  const readClipboard = async () => {
    if (!navigator.clipboard?.read) {
      return setMessage({ kind: "info", text: "이 브라우저는 버튼으로 클립보드를 읽지 못해요. Ctrl+V(⌘V)로 붙여넣어 주세요." });
    }
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) return void receiptFromImage(await item.getType(type));
      }
      setMessage({ kind: "info", text: "클립보드에 이미지가 없어요. 스크린샷을 복사한 뒤 다시 눌러 주세요." });
    } catch {
      setMessage({ kind: "info", text: "클립보드를 읽지 못했어요(권한). Ctrl+V(⌘V)로 붙여넣어 주세요." });
    }
  };

  const close = () => {
    if (dirty && !confirm("저장하지 않은 내용이 있습니다. 닫을까요?\n(브라우저 임시저장에는 남아 있어요)")) return;
    router.push(props.closeHref);
  };

  return (
    <div className="editor">
      <div className="editor-bar">
        {props.mode === "new" ? (
          <label className="name-field">
            <span className="muted small">{props.folderName} /</span>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameAuto(false);
              }}
              aria-label="파일 이름"
              placeholder="파일 이름"
              spellCheck={false}
            />
            <span className="muted small">.md</span>
          </label>
        ) : (
          <span className="file-name">{props.fileName}</span>
        )}
        <div className={`tabs${tabbedForm ? " has-form" : ""}`} role="tablist">
          {tabbedForm && (
            <button role="tab" aria-selected={tab === "form"} onClick={() => setTab("form")}>
              항목
            </button>
          )}
          <button role="tab" aria-selected={tab === "write"} onClick={() => setTab("write")}>
            쓰기
          </button>
          <button role="tab" className="tab-preview" aria-selected={tab === "preview"} onClick={() => setTab("preview")}>
            미리보기
          </button>
        </div>
        <button
          className="btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={!!uploading}
          title="사진 넣기 (붙여넣기·끌어다 놓기도 됩니다)"
        >
          <ImagePlus size={16} aria-hidden />
          사진
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = imageFiles(e.target.files);
            e.target.value = "";
            if (files.length) uploadRef.current(files);
          }}
        />
        {/* 항목 탭에는 폼 안에 같은 버튼이 있다 */}
        {props.places && tab !== "form" && (
          <button className="btn" onClick={() => setPicker(true)} disabled={!!uploading} title="들른 곳을 찾아 지도 좌표와 함께 넣습니다">
            <MapPinPlus size={16} aria-hidden />
            장소 추가
          </button>
        )}
        {props.mode === "new" && props.receipt && (
          <span className="receipt-tools">
            <button className="btn" onClick={() => setCamera(true)} disabled={!!uploading} title="카메라로 영수증을 찍어 바로 읽습니다 (사진 파일을 만들지 않음)">
              <Camera size={16} aria-hidden />
              카메라로 읽기
            </button>
            <button
              className="btn"
              onClick={() => receiptInputRef.current?.click()}
              disabled={!!uploading}
              title="주문내역 캡처 같은 이미지를 골라 읽습니다"
            >
              <ImageUp size={16} aria-hidden />
              이미지로 읽기
            </button>
            <button
              className="btn"
              onClick={() => void readClipboard()}
              disabled={!!uploading}
              title="복사해 둔 스크린샷을 읽습니다 (Ctrl+V로 붙여넣어도 됩니다)"
            >
              <ClipboardPaste size={16} aria-hidden />
              클립보드에서 읽기
            </button>
            <label className="small muted attach-opt">
              <input type="checkbox" checked={attachReceipt} onChange={(e) => setAttachReceipt(e.target.checked)} /> 이미지도 글에 첨부
            </label>
            <input
              ref={receiptInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = imageFiles(e.target.files)[0];
                e.target.value = "";
                if (file) void receiptFromImage(file);
              }}
            />
          </span>
        )}
        <span className="spacer" />
        {uploading && <span className="status small muted">{uploading}</span>}
        {/* 저장 후 다시 고치기 시작하면 '저장됨' 대신 '저장 안 됨' */}
        {message && (message.kind !== "ok" || !dirty) ? (
          <span className={`status small ${message.kind}`}>{message.text}</span>
        ) : (
          dirty && <span className="status small muted">저장 안 됨</span>
        )}
        <button className="btn" onClick={close}>
          닫기
        </button>
        <button
          className="btn btn-save"
          onClick={() => void (props.mode === "edit" && !dirty && props.doneHref ? router.push(props.doneHref) : save(false, true))}
          title={props.mode === "new" ? "만들고 목록으로" : "저장하고 목록으로 (Ctrl+S는 저장만)"}
        >
          {props.mode === "new" ? "만들기" : "저장"}
        </button>
      </div>

      {pendingDraft && (
        <div className="banner">
          <span>저장하지 않은 임시본이 있습니다 ({fmtTime(pendingDraft.at)}).</span>
          <button
            className="btn"
            onClick={() => {
              replaceDoc(pendingDraft.text);
              if (pendingDraft.name) {
                setName(pendingDraft.name);
                setNameAuto(false);
              }
              setPendingDraft(null);
            }}
          >
            복원
          </button>
          <button
            className="btn"
            onClick={() => {
              writeDraft(draftKey, null);
              setPendingDraft(null);
            }}
          >
            버리기
          </button>
        </div>
      )}

      {conflict && (
        <div className="banner warn">
          <span>
            Drive나 다른 기기에서 이 파일이 먼저 바뀌었습니다. 내 내용으로 덮어쓰거나, Drive 내용을 불러올 수 있어요.
          </span>
          <button className="btn" onClick={() => void save(true)}>
            내 내용으로 덮어쓰기
          </button>
          <button
            className="btn"
            onClick={() => {
              if (!confirm("지금 편집기의 내용을 Drive 내용으로 바꿉니다. 계속할까요?")) return;
              writeDraft(draftKey, { text, at: Date.now() }); // 혹시 몰라 내 내용은 임시본으로 남겨 둔다
              replaceDoc(conflict.text);
              setSavedText(conflict.text);
              setChecksum(conflict.checksum);
              setConflict(null);
              setMessage({ kind: "ok", text: "Drive 내용을 불러왔습니다." });
            }}
          >
            Drive 내용 불러오기
          </button>
          <details>
            <summary className="small">Drive에 있는 내용 보기</summary>
            <pre>{conflict.text}</pre>
          </details>
        </div>
      )}

      {props.form === "diary" && tab === "write" && (
        <MetaForm kind="diary" text={text} onChange={(next) => replaceDoc(next, false)} suggestions={suggestions} />
      )}
      <div className={`editor-panes show-${tab}`}>
        {tabbedForm && (
          <div className="pane-form">
            <MetaForm
              kind={tabbedForm}
              text={text}
              onChange={(next) => replaceDoc(next, false)}
              suggestions={suggestions}
              onAddPlace={props.places ? () => setPicker(true) : undefined}
              onAddCategory={props.manageCategories ? addCategory : undefined}
            />
          </div>
        )}
        <div className="pane-write" ref={hostRef} />
        <div className="pane-preview">
          <NoteBody text={previewText} links={resolver} />
        </div>
      </div>
      {camera && (
        <ReceiptCamera
          onCapture={(blob) => void readReceiptImage(blob)}
          onClose={() => setCamera(false)}
          onUnavailable={(text) => {
            setCamera(false);
            setMessage({ kind: "error", text });
          }}
        />
      )}
      {picker && <PlacePicker onPick={insertPlace} onClose={() => setPicker(false)} />}
      <p className="hint small muted">
        {receiptMode
          ? "Ctrl+S 저장 · 스크린샷은 복사한 뒤 Ctrl+V(⌘V)로 붙여넣으면 바로 영수증으로 읽어요 · 입력 내용은 브라우저에 자동 임시저장"
          : "Ctrl+S 저장 · 입력 내용은 브라우저에 자동 임시저장 · 사진은 붙여넣기·끌어다 놓기도 됩니다"}
      </p>
    </div>
  );
}
