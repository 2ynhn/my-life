export function DriveProblem({ message }: { message: string }) {
  return (
    <div className="error-box">
      <h1>Drive를 불러오지 못했습니다</h1>
      <p className="alert">{message}</p>
      <p>설정을 고친 뒤 Vercel에서 다시 배포(Redeploy)하고 새로고침하세요.</p>
    </div>
  );
}
