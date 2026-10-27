"use client";

/** 레이아웃 자체가 실패했을 때의 마지막 안전망 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body style={{ fontFamily: "sans-serif", padding: "2rem", lineHeight: 1.6 }}>
        <h1>문제가 생겼습니다</h1>
        <p>서버 오류가 났습니다. Vercel → 프로젝트 → Logs 에서 자세한 내용을 볼 수 있어요.</p>
        {error.digest && <p style={{ color: "#888" }}>오류 코드: {error.digest}</p>}
        <button onClick={reset}>다시 시도</button>
      </body>
    </html>
  );
}
