import Link from "next/link";

export function DriveProblem({ message, reauth }: { message: string; reauth?: boolean }) {
  return (
    <div className="error-box">
      <h1>Drive를 불러오지 못했습니다</h1>
      <p className="alert">{message}</p>
      {reauth ? (
        <Link className="btn btn-save" href="/login?reauth=1">
          다시 로그인
        </Link>
      ) : (
        <p>잠시 뒤 다시 시도하세요. 계속되면 Vercel 로그를 확인하세요.</p>
      )}
    </div>
  );
}
