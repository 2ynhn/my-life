import type { Metadata } from "next";

export const metadata: Metadata = { title: "개인정보처리방침" };

export default function PrivacyPage() {
  return (
    <main className="prose standalone">
      <h1>개인정보처리방침</h1>
      <p>my-life는 각자의 Google Drive에 있는 마크다운 일기를 웹에서 읽고 쓰게 해 주는 서비스입니다.</p>
      <h2>수집하는 정보</h2>
      <ul>
        <li>Google 로그인 시 이메일 주소, 이름, 프로필 사진 — 로그인한 사람을 구분하는 데만 사용합니다.</li>
        <li>
          Google Drive 접근 토큰 — 로그인한 사람 본인의 브라우저에 있는 암호화된 쿠키에만 보관합니다. 서버나 데이터베이스에 따로
          저장하지 않습니다.
        </li>
      </ul>
      <h2>Google Drive 데이터</h2>
      <p>
        서비스는 로그인한 사람 본인의 권한으로만 Drive를 읽고 씁니다. 주로 <code>my-life</code> 폴더와, 다른 사람이 본인에게 공유한
        일기장 폴더를 다룹니다. 다른 사람과의 공유는 Google Drive의 공유 기능으로 이루어지며, 공유받지 않은 내용에는 접근할 수
        없습니다. 데이터를 제3자에게 제공하거나 광고에 사용하지 않습니다.
      </p>
      <h2>연결 끊기</h2>
      <p>
        Google 계정 설정의 &lsquo;타사 앱 및 서비스&rsquo;에서 my-life의 접근 권한을 언제든 삭제할 수 있습니다. 로그아웃하면 브라우저의
        로그인 쿠키와, 화면을 빨리 보여 주려고 기기(브라우저 저장소)에 받아 둔 글 사본도 지워집니다.
      </p>
    </main>
  );
}
