"use client";

import { NotebookPen, Plane, Plus, Receipt, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { quickNote } from "@/app/(app)/note-actions";
import { clearShared, peekShared } from "@/lib/share-store";

// 휴대폰 '공유하기'로 받은 것을 어디에 넣을지 고른다.
// 이미지: 구매(영수증으로 읽기) · 일기(오늘 일기에 사진) · 여행(최근 여행이나 새 여행에 사진). 글·링크: 오늘 일기에 한 줄.
// 받은 내용은 브라우저 안(Cache Storage)에만 있고, 다 쓰거나 버리면 지운다.

export type ShareTargets = {
  purchase: string | null;
  diary: { href: string; exists: boolean } | null;
  travelNew: string | null;
  trips: { title: string; path: string; href: string }[];
};

export function ShareInbox({ rootId, targets, retry }: { rootId: string | null; targets: ShareTargets; retry: boolean }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: true; href: string } | { ok: false; error: string } | null>(null);

  useEffect(() => {
    let urls: string[] = [];
    (async () => {
      const shared = await peekShared();
      setImages((urls = shared.images.map((b) => URL.createObjectURL(b))));
      setText(shared.text);
      setLoaded(true);
    })();
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  if (!loaded) return <p className="muted">받은 내용을 여는 중…</p>;

  if (!images.length && !text)
    return (
      <div className="share-empty">
        {retry ? (
          <p className="status error">앱이 공유를 받을 준비를 막 마쳤어요. 같은 이미지(또는 글)를 한 번 더 공유해 주세요.</p>
        ) : (
          <p className="muted">공유받은 내용이 없어요.</p>
        )}
        <p className="muted small">
          휴대폰(안드로이드 크롬)에 my-life를 홈 화면에 설치하면, 갤러리·쇼핑 앱의 <b>공유하기</b> 목록에 my-life가 나옵니다. 사진은 구매(영수증
          읽기)·일기·여행 중 넣을 곳을 고르고, 글이나 링크는 오늘 일기에 한 줄로 남길 수 있어요. (아이폰은 아직 이 기능을 지원하지 않아요)
        </p>
        <Link className="btn" href="/">
          첫 화면으로
        </Link>
      </div>
    );

  const many = images.length > 1;
  return (
    <div className="share-inbox">
      {images.length > 0 && (
        <section className="share-card">
          <div className={`share-thumbs${many ? " many" : ""}`}>
            {images.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt={`공유받은 이미지 ${i + 1}`} />
            ))}
          </div>
          <h2 className="share-q">{many ? `사진 ${images.length}장을 어디에 넣을까요?` : "어디에 넣을까요?"}</h2>
          <ul className="share-targets">
            {targets.purchase && (
              <li>
                <Link href={targets.purchase} className="share-target">
                  <span className="ficon ficon-md ficon-spending" aria-hidden>
                    <Receipt size={20} strokeWidth={1.75} />
                  </span>
                  <span>
                    <strong>구매 · 영수증으로 읽기</strong>
                    <span className="muted small">
                      {many ? "첫 장을 읽어 금액·가게를 채워요" : "금액·가게를 채워요"} (사진 파일은 만들지 않음)
                    </span>
                  </span>
                </Link>
              </li>
            )}
            {targets.diary && (
              <li>
                <Link href={targets.diary.href} className="share-target">
                  <span className="ficon ficon-md ficon-diary" aria-hidden>
                    <NotebookPen size={20} strokeWidth={1.75} />
                  </span>
                  <span>
                    <strong>일기 · 오늘 일기에 사진 넣기</strong>
                    <span className="muted small">{targets.diary.exists ? "오늘 일기 끝에 붙여요" : "오늘 일기를 새로 쓰며 넣어요"}</span>
                  </span>
                </Link>
              </li>
            )}
            {(targets.travelNew || targets.trips.length > 0) && (
              <li className="share-travel">
                <span className="share-target static">
                  <span className="ficon ficon-md ficon-travel" aria-hidden>
                    <Plane size={20} strokeWidth={1.75} />
                  </span>
                  <span>
                    <strong>여행 · 여행 글에 사진 넣기</strong>
                    <span className="muted small">넣을 여행을 고르세요</span>
                  </span>
                </span>
                <ul className="share-trips">
                  {targets.trips.map((t) => (
                    <li key={t.href}>
                      <Link href={t.href}>
                        {t.title}
                        {t.path && <span className="muted small"> · {t.path}</span>}
                      </Link>
                    </li>
                  ))}
                  {targets.travelNew && (
                    <li>
                      <Link href={targets.travelNew} className="new-trip">
                        <Plus size={14} aria-hidden /> 새 여행
                      </Link>
                    </li>
                  )}
                </ul>
              </li>
            )}
          </ul>
          <p className="muted small">일기·여행에 넣은 사진은 줄인 사본이 그 글의 attachments 폴더에 저장돼요. 넣은 뒤 저장을 눌러야 글에 남아요.</p>
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
                  if (res.ok) await clearShared("text");
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
