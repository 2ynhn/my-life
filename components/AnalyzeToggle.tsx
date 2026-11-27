"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setAnalyzeAction } from "@/app/(app)/settings/actions";

// 설정: 공유받은 이미지를 AI로 정리하기 켜고 끄기 (내 키로만, 기본 끔)

export function AnalyzeToggle({ on: initial, hasKey }: { on: boolean; hasKey: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const change = async (next: boolean) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await setAnalyzeAction(next);
      if (res.ok) {
        setOn(next);
        setMsg({ ok: true, text: next ? "켰어요. 이제 공유한 사진을 AI가 읽어 채워요." : "껐어요. 공유한 사진은 그대로 넣기만 해요." });
        router.refresh();
      } else setMsg({ ok: false, text: res.error });
    } catch {
      setMsg({ ok: false, text: "서버에 연결하지 못했습니다." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="analyze-toggle">
      <label className="toggle-row">
        <input type="checkbox" checked={on} disabled={busy || (!hasKey && !on)} onChange={(e) => void change(e.target.checked)} />
        <span>
          <strong>공유받은 이미지를 AI로 정리</strong>
          <span className="muted small">
            휴대폰 &apos;공유하기&apos;로 받은 사진을 일기·음식·여행·운동에 넣으면, AI가 사진을 읽어 칸(운동 시간·거리·칼로리, 식당·메뉴 등)과 본문을 채워요.
            저장 전에 확인·수정할 수 있고, 한 번에 사진 3장까지 읽어요. 비용은 위의 내 API 키로 나가요.
          </span>
        </span>
      </label>
      {!hasKey && <p className="muted small">켜려면 먼저 위에서 API 키를 저장하세요.</p>}
      {msg && <p className={`small ${msg.ok ? "status ok" : "status error"}`}>{msg.text}</p>}
    </div>
  );
}
