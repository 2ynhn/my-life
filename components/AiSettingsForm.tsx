"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveAiAction } from "@/app/(app)/settings/actions";

type Props = { models: Record<string, string>; model: string; hasKey: boolean; keyHint: string };

export function AiSettingsForm({ models, model: initialModel, hasKey, keyHint }: Props) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [model, setModel] = useState(initialModel);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (remove = false) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await saveAiAction(key, model, remove);
      if (res.ok) {
        setKey("");
        setMsg({ ok: true, text: remove ? "키를 지웠습니다." : "저장했습니다." });
        router.refresh();
      } else setMsg({ ok: false, text: res.error });
    } catch {
      setMsg({ ok: false, text: "서버에 연결하지 못했습니다." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="ai-form"
      onSubmit={(e) => {
        e.preventDefault();
        void run();
      }}
    >
      <p className="small">
        현재: {hasKey ? <b>키 등록됨 ({keyHint})</b> : <span className="muted">키 없음</span>}
      </p>
      <label className="field">
        <span className="small muted">API 키 {hasKey && "(바꿀 때만 입력)"}</span>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-ant-…"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label className="field">
        <span className="small muted">모델</span>
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          {Object.entries(models).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        <button className="btn btn-save" type="submit" disabled={busy || (!key && !hasKey)}>
          {busy ? "확인 중…" : "저장"}
        </button>
        {hasKey && (
          <button
            className="btn danger"
            type="button"
            disabled={busy}
            onClick={() => confirm("저장된 API 키를 지울까요?") && void run(true)}
          >
            키 지우기
          </button>
        )}
        {msg && <span className={`status small ${msg.ok ? "ok" : "error"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
