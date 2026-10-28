// 화면을 누르자마자 보이는 자리표시 (서버 응답을 기다리는 동안)
export function PageSkeleton() {
  return (
    <div className="skeleton" role="status" aria-label="불러오는 중">
      <span className="sk sk-title" />
      <span className="sk sk-line" />
      <span className="sk sk-line short" />
      <div className="sk-grid">
        <span className="sk sk-card" />
        <span className="sk sk-card" />
      </div>
      <span className="sk sk-line" />
      <span className="sk sk-line" />
    </div>
  );
}
