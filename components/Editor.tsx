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
import { tableResolver, type LinkTable } from "@/lib/markdown";

type Props = {
  links: LinkTable;
  initialText: string;
  /** 취소·닫기 시 돌아갈 주소 */
  closeHref: string;
} & (
  | { mode: "edit"; fileId: string; fileName: string; checksum: string }
  | { mode: "new"; folderId: string; folderName: string; defaultName: string; subfolder?: string }
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

  const draftKey = props.mode === "edit" ? `my-life:draft:${props.fileId}` : `my-life:draft:new:${props.folderId}`;

  const [text, setText] = useState(props.initialText);
  const [savedText, setSavedText] = useState(props.initialText);
  const [checksum, setChecksum] = useState(props.mode === "edit" ? props.checksum : "");
  const [name, setName] = useState(props.mode === "new" ? props.defaultName : "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [conflict, setConflict] = useState<{ text: string; checksum: string } | null>(null);
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");

  const dirty = props.mode === "new" ? text.trim() !== "" && text !== props.initialText : text !== savedText;
  const previewText = useDeferredValue(text);
  const resolver = useMemo(() => tableResolver(props.links), [props.links]);

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
          const res = await saveNote(props.fileId, checksum, current, force);
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
          const res = await createNote(props.folderId, name, current, props.subfolder);
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
        <span className="spacer" />
        {/* 저장 후 다시 고치기 시작하면 '저장됨' 대신 '저장 안 됨' */}
        {message && (message.kind === "error" || !dirty) ? (
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
      <p className="hint small muted">
        Ctrl+S 저장 · 입력 내용은 브라우저에 자동 임시저장 · 이미지는 <code>![[파일명.jpg]]</code>
      </p>
    </div>
  );
}
