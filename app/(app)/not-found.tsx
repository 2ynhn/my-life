import Link from "next/link";

export default function NotFound() {
  return (
    <div className="error-box">
      <h1>찾을 수 없습니다</h1>
      <p>파일이 옮겨졌거나 이름이 바뀌었을 수 있어요. 상단의 새로고침을 눌러 보세요.</p>
      <Link className="btn" href="/">
        처음으로
      </Link>
    </div>
  );
}
