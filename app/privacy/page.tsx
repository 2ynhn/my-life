import type { Metadata } from "next";

export const metadata: Metadata = { title: "개인정보처리방침" };

export default function PrivacyPage() {
  return (
    <main className="prose standalone">
      <h1>개인정보처리방침</h1>
      <p>my-life는 운영자 본인과 운영자가 초대한 사람만 사용하는 개인용 일기 열람 서비스입니다.</p>
      <h2>수집하는 정보</h2>
      <ul>
        <li>Google 로그인 시 이메일 주소, 이름, 프로필 사진 — 허용된 사용자인지 확인하는 데만 사용합니다.</li>
        <li>별도의 데이터베이스에 저장하지 않으며, 로그인 상태는 암호화된 쿠키로만 유지됩니다.</li>
      </ul>
      <h2>Google Drive 데이터</h2>
      <p>
        서비스는 운영자 본인의 Google Drive 안 지정된 폴더(my-life)의 파일만 읽고 씁니다. 로그인한 다른 사용자의 Drive에는
        접근하지 않습니다. 데이터를 제3자에게 제공하거나 광고에 사용하지 않습니다.
      </p>
      <h2>문의</h2>
      <p>서비스 운영자에게 직접 연락하세요.</p>
    </main>
  );
}
