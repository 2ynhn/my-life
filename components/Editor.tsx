"use client";

import { markdown } from "@codemirror/lang-markdown";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { tags as t } from "@lezer/highlight";
import { EditorView, placeholder } from "@codemirror/view";
import { minimalSetup } from "codemirror";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createNote, saveNote } from "@/app/(app)/note-actions";
import { NoteBody } from "@/components/NoteBody";
import { PlacePicker } from "@/components/PlacePicker";
import { ReceiptCamera } from "@/components/ReceiptCamera";
import { addPlace } from "@/lib/frontmatter-edit";
import { imageFiles, prepareImage, uploadImage } from "@/lib/image-upload";
import { tableResolver, type LinkTable } from "@/lib/markdown";
import { fillReceipt, receiptFileName, type Receipt } from "@/lib/receipt-shape";

type Props = {
  links: LinkTable;
  initialText: string;
  /** 취소·닫기 시 돌아갈 주소 */
  closeHref: string;
  /** 이 글이 있는 일기장 (Drive 폴더 id) */
  rootId: string;
  /** 사진을 올릴 때 기준이 되는 노트 폴더 (가장 가까운 attachments 폴더에 저장) */
  uploadFolderId: string;
  /** 여행 폴더면 '장소 추가' 버튼을 보인다 */
  places?: boolean;
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
    }
);

type Draft = { text: string; name?: string; at: number };

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

// 브라우저 저장소는 사생활 보호 모드 등에서 막힐 수 있으므로 항상 try/catch
function readDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
function writeDraft(key: string, draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  } catch {}
}

const fmtTime = (t: number) => new Date(t).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });

export function Editor(props: Props) {
  const router = useRouter();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const saveRef = useRef<() => void>(() => {});
  const uploadRef = useRef<(files: File[]) => void>(() => {});
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
  const [busy, setBusy] = useState(false);
  // ok: 저장됨(다시 고치면 사라짐) · info: 안내(고쳐도 남음) · error
  const [message, setMessage] = useState<{ kind: "ok" | "info" | "error"; text: string } | null>(null);
  const [conflict, setConflict] = useState<{ text: string; checksum: string } | null>(null);
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [uploading, setUploading] = useState<string | null>(null);
  // 이번에 올린 사진: 미리보기에서 바로 보이도록 링크 표에 더한다
  const [uploaded, setUploaded] = useState<Record<string, string>>({});

  const dirty = props.mode === "new" ? text.trim() !== "" && text !== props.initialText : text !== savedText;
  const previewText = useDeferredValue(text);
  const resolver = useMemo(
    () => tableResolver({ ...props.links, attachments: { ...props.links.attachments, ...uploaded } }),
    [props.links, uploaded],
  );

  const replaceDoc = useCallback((next: string) => {
    const view = viewRef.current;
    if (view) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
      view.focus();
    }
    setText(next);
  }, []);

  // CodeMirror 생성 (한 번만)
  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      doc: props.initialText,
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
          if (u.docChanged) setText(u.state.doc.toString());
        }),
        // 사진 붙여넣기·끌어다 놓기
        EditorView.domEventHandlers({
          paste(e) {
            const files = imageFiles(e.clipboardData?.files);
            if (!files.length) return false;
            e.preventDefault();
            uploadRef.current(files);
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

  // 저장 안 된 임시본이 있으면 복원할지 묻는다
  useEffect(() => {
    const draft = readDraft(draftKey);
    if (draft && draft.text !== props.initialText) setPendingDraft(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // 입력이 멈추면 1초 뒤 브라우저에 임시저장
  useEffect(() => {
    if (!dirty || pendingDraft) return;
    const t = setTimeout(() => writeDraft(draftKey, { text, name: name || undefined, at: Date.now() }), 1000);
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

  const save = useCallback(
    async (force = false) => {
      if (busy) return;
      setBusy(true);
      setMessage(null);
      const current = viewRef.current?.state.doc.toString() ?? text;
      try {
        if (props.mode === "edit") {
          const res = await saveNote(props.rootId, props.fileId, checksum, current, force);
          if (res.ok) {
            setChecksum(res.checksum);
            setSavedText(current);
            setConflict(null);
            writeDraft(draftKey, null);
            setMessage({ kind: "ok", text: `저장됨 · ${fmtTime(Date.now())}` });
          } else {
            setConflict(res.conflict ?? null);
            setMessage({ kind: "error", text: res.error });
          }
        } else {
          const res = await createNote(props.rootId, props.folderId, name, current, props.subfolder);
          if (res.ok) {
            writeDraft(draftKey, null);
            setSavedText(current);
            router.push(res.href);
          } else {
            setMessage({ kind: "error", text: res.error });
          }
        }
      } catch {
        setMessage({ kind: "error", text: "서버에 연결하지 못했습니다. 내용은 브라우저에 임시저장되어 있어요." });
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, text, checksum, name, draftKey],
  );
  saveRef.current = () => void save();

  // 한 장씩 차례로 올리고, 올라갈 때마다 커서 자리에 ![[이름]] 을 넣는다
  uploadRef.current = async (files: File[]) => {
    if (uploading) return;
    setMessage(null);
    try {
      for (const [i, file] of files.entries()) {
        setUploading(files.length > 1 ? `사진 올리는 중… (${i + 1}/${files.length})` : "사진 올리는 중…");
        const { name, url } = await uploadImage(file, props.rootId, props.uploadFolderId);
        setUploaded((prev) => ({ ...prev, [name.toLowerCase()]: url }));
        const view = viewRef.current;
        if (view) {
          const { from } = view.state.selection.main;
          const before = from > 0 ? view.state.sliceDoc(from - 1, from) : "\n";
          const insert = `${before === "\n" ? "" : "\n"}![[${name}]]\n`;
          view.dispatch(view.state.replaceSelection(insert));
          view.focus();
        }
      }
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "사진을 올리지 못했습니다." });
    } finally {
      setUploading(null);
    }
  };

  // 영수증: 카메라로 찍거나 고른 이미지를 메모리에서 바로 서버로 보내 Claude로 읽고, 템플릿 앞머리를 채운다.
  // 파일은 만들지 않는다. '이미지도 글에 첨부'를 켰을 때만 attachments에 올린다. 저장은 직접 확인 후
  const readReceiptImage = async (image: Blob) => {
    if (uploading || props.mode !== "new") return;
    setMessage(null);
    setCamera(false);
    try {
      setUploading("영수증 읽는 중… (10~30초)");
      const res = await fetch("/api/receipt", {
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
      replaceDoc(addPlace(current, { ...p, date }));
      setMessage({ kind: "info", text: `'${p.name}'을(를) 장소 목록에 넣었어요. 날짜가 다르면 고쳐 주세요.` });
    } catch {
      setMessage({ kind: "error", text: "앞머리(--- 사이)를 읽지 못해 장소를 넣지 못했습니다. 형식을 확인해 주세요." });
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
              onChange={(e) => setName(e.target.value)}
              aria-label="파일 이름"
              placeholder="파일 이름"
              spellCheck={false}
            />
            <span className="muted small">.md</span>
          </label>
        ) : (
          <span className="file-name">{props.fileName}</span>
        )}
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "write"} onClick={() => setTab("write")}>
            쓰기
          </button>
          <button role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")}>
            미리보기
          </button>
        </div>
        <button
          className="btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={!!uploading}
          title="사진 넣기 (붙여넣기·끌어다 놓기도 됩니다)"
        >
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
        {props.places && (
          <button className="btn" onClick={() => setPicker(true)} disabled={!!uploading} title="들른 곳을 찾아 지도 좌표와 함께 넣습니다">
            📍 장소 추가
          </button>
        )}
        {props.mode === "new" && props.receipt && (
          <span className="receipt-tools">
            <button className="btn" onClick={() => setCamera(true)} disabled={!!uploading} title="카메라로 영수증을 찍어 바로 읽습니다 (사진 파일을 만들지 않음)">
              📷 카메라로 읽기
            </button>
            <button
              className="btn"
              onClick={() => receiptInputRef.current?.click()}
              disabled={!!uploading}
              title="주문내역 캡처 같은 이미지를 골라 읽습니다"
            >
              🖼 이미지로 읽기
            </button>
            <label className="small muted attach-opt">
              <input type="checkbox" checked={attachReceipt} onChange={(e) => setAttachReceipt(e.target.checked)} /> 이미지도 글에 첨부
            </label>
            <input
              ref={receiptInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const file = imageFiles(e.target.files)[0];
                e.target.value = "";
                if (!file) return;
                try {
                  // 큰 사진은 줄여서 보낸다 (서버 한도 4MB)
                  void readReceiptImage(await prepareImage(file));
                } catch (err) {
                  setMessage({ kind: "error", text: err instanceof Error ? err.message : "이미지를 열지 못했습니다." });
                }
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
        <button className="btn" onClick={close} disabled={busy}>
          닫기
        </button>
        <button className="btn btn-save" onClick={() => void save()} disabled={busy || (props.mode === "edit" && !dirty)}>
          {busy ? "저장 중…" : props.mode === "new" ? "만들기" : "저장"}
        </button>
      </div>

      {pendingDraft && (
        <div className="banner">
          <span>저장하지 않은 임시본이 있습니다 ({fmtTime(pendingDraft.at)}).</span>
          <button
            className="btn"
            onClick={() => {
              replaceDoc(pendingDraft.text);
              if (pendingDraft.name) setName(pendingDraft.name);
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
          <button className="btn" onClick={() => void save(true)} disabled={busy}>
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
            disabled={busy}
          >
            Drive 내용 불러오기
          </button>
          <details>
            <summary className="small">Drive에 있는 내용 보기</summary>
            <pre>{conflict.text}</pre>
          </details>
        </div>
      )}

      <div className={`editor-panes show-${tab}`}>
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
        Ctrl+S 저장 · 입력 내용은 브라우저에 자동 임시저장 · 사진은 붙여넣기·끌어다 놓기도 됩니다
      </p>
    </div>
  );
}
