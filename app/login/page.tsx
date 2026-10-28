import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { getUser } from "@/lib/session";

export const metadata: Metadata = { title: "로그인" };

const ERRORS: Record<string, string> = {
  AccessDenied: "로그인할 수 없는 계정입니다. 구글에서 이메일 인증을 마친 계정으로 로그인하세요.",
  DriveScope: "Drive 접근을 허용해야 쓸 수 있어요. 다시 로그인하면서 동의 화면에서 Drive 항목을 체크해 주세요.",
  Configuration: "로그인 설정에 문제가 있습니다. 환경변수(AUTH_*)를 확인하세요.",
};

/** 같은 사이트 안의 주소만 (//evil.com 같은 외부 주소 차단) */
const safeNext = (next?: string) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/");

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; reauth?: string }>;
}) {
  const { error, next, reauth } = await searchParams;
  const target = safeNext(next);
  // 다시 로그인(토큰 만료)일 때는 쿠키가 남아 있어도 이 화면을 보여 준다
  if (!reauth && (await getUser())) redirect(target);

  return (
    <main className="login">
      <div className="login-card">
        <h1>my-life</h1>
        <p className="muted">내 Google Drive에 쓰는 일기장</p>
        {error && <p className="alert">{ERRORS[error] ?? "로그인에 실패했습니다. 다시 시도하세요."}</p>}
        {reauth && <p className="alert">Drive 연결이 끊겼습니다. 다시 로그인해 주세요.</p>}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: target });
          }}
        >
          <button className="btn btn-primary" type="submit">
            Google 계정으로 로그인
          </button>
        </form>
        <p className="muted small login-note">
          일기는 이 사이트가 아니라 <b>각자의 Google Drive</b>에 저장됩니다. 로그인할 때 Drive 접근을 허용해 주세요.
        </p>
        <a className="muted small" href="/privacy">
          개인정보처리방침
        </a>
      </div>
    </main>
  );
}
