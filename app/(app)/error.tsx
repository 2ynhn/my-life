"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="error-box">
      <h1>불러오지 못했습니다</h1>
      <p>{error.message || "알 수 없는 오류"}</p>
      <button className="btn" onClick={reset}>
        다시 시도
      </button>
    </div>
  );
}
