"use client";

import { NotebookPen, Receipt, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { quickNote } from "@/app/(app)/note-actions";

// 휴대폰 '공유하기'로 받은 것: 이미지는 영수증으로 읽고, 글·링크는 오늘 일기에 한 줄로.
// 받은 내용은 브라우저 안(Cache Storage)에만 있고, 다 쓰거나 버리면 지운다.

export const SHARE_CACHE = "my-life-share";

export async function takeSharedImage(): Promise<Blob | null> {
  try {
    const cache = await caches.open(SHARE_CACHE);
    const res = await cache.match("/__share/image");
    if (!res) return null;
    const blob = await res.blob();
    await cache.delete("/__share/image");
    return blob;
  } catch {
    return null;
  }
}

async function clearShared() {
  try {
    const cache = await caches.open(SHARE_CACHE);
    await Promise.all([cache.delete("/__share/image"), cache.delete("/__share/text")]);
  } catch {}
}

export function ShareInbox({
  rootId,
  purchaseHref,
  retry,
}: {
  rootId: string | null;
  purchaseHref: string | null;
  retry: boolean;
}) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: true; href: string } | { ok: false; error: string } | null>(null);

  useEffect(() => {
    let url: string | null = null;
    (async () => {
      try {
        const cache = await caches.open(SHARE_CACHE);
        const img = await cache.match("/__share/image");
        if (img) setImage((url = URL.createObjectURL(await img.blob())));
        const t = await cache.match("/__share/text");
        if (t) setText(await t.text());
      } catch {}
      setLoaded(true);
    })();
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, []);

  if (!loaded) return <p className="muted">받은 내용을 여는 중…</p>;

  if (!image && !text)
    return (
      <div className="share-empty">
        {retry ? (
          <p className="status error">앱이 공유를 받을 준비를 막 마쳤어요. 같은 이미지(또는 글)를 한 번 더 공유해 주세요.</p>
        ) : (
          <p className="muted">공유받은 내용이 없어요.</p>
        )}
        <p className="muted small">
          휴대폰(안드로이드 크롬)에 my-life를 홈 화면에 설치하면, 갤러리·쇼핑 앱의 <b>공유하기</b> 목록에 my-life가 나옵니다. 주문내역
          캡처를 공유하면 영수증으로 읽고, 글이나 링크를 공유하면 오늘 일기에 한 줄로 남길 수 있어요. (아이폰은 아직 이 기능을 지원하지
          않아요)
        </p>
        <Link className="btn" href="/">
          첫 화면으로
        </Link>
      </div>
    );

  return (
    <div className="share-inbox">
      {image && (
        <section className="share-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="공유받은 이미지" />
          <div className="share-actions">
            {purchaseHref ? (
              <button className="btn btn-save" onClick={() => router.push(`${purchaseHref}?mode=new&shared=1`)}>
                <Receipt size={16} aria-hidden />
                영수증으로 읽기
              </button>
            ) : (
              <p className="muted small">구매 폴더가 없어요. 첫 화면의 구매 카드에서 &apos;시작하기&apos;를 먼저 눌러 주세요.</p>
            )}
          </div>
          <p className="muted small">이미지는 파일로 저장하지 않고 읽기만 해요. 원본이 필요하면 편집기에서 &apos;이미지도 글에 첨부&apos;를 켜세요.</p>
        </section>
      )}
      {text && rootId && (
        <section className="share-card">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} aria-label="공유받은 글" />
          <div className="share-actions">
            <button
              className="btn btn-save"
              disabled={pending || !text.trim()}
              onClick={() =>
                start(async () => {
                  const res = await quickNote(rootId, text).catch(() => ({ ok: false as const, error: "서버에 연결하지 못했습니다." }));
                  setResult(res);
                  if (res.ok) {
                    try {
                      await (await caches.open(SHARE_CACHE)).delete("/__share/text");
                    } catch {}
                  }
                })
              }
            >
              <NotebookPen size={16} aria-hidden />
              {pending ? "남기는 중…" : "오늘 일기에 한 줄로"}
            </button>
          </div>
          {result && (
            <p className={`small ${result.ok ? "quick-result ok" : "status error"}`}>
              {result.ok ? (
                <>
                  오늘 일기에 남겼어요 · <Link href={result.href}>보기</Link>
                </>
              ) : (
                result.error
              )}
            </p>
          )}
        </section>
      )}
      <button
        className="btn"
        onClick={async () => {
          await clearShared();
          router.push("/");
        }}
      >
        <Trash2 size={16} aria-hidden />
        버리기
      </button>
    </div>
  );
}
