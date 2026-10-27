import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { getUser } from "@/lib/session";

export const metadata: Metadata = { title: "로그인" };

const ERRORS: Record<string, string> = {
  AccessDenied: "허용되지 않은 계정입니다. 등록된 구글 계정으로 로그인하세요.",
  Configuration: "로그인 설정에 문제가 있습니다. 환경변수(AUTH_*)를 확인하세요.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getUser()) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="login">
      <div className="login-card">
        <h1>my-life</h1>
        <p className="muted">나만 보는 일기장</p>
        {error && <p className="alert">{ERRORS[error] ?? "로그인에 실패했습니다. 다시 시도하세요."}</p>}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="btn btn-primary" type="submit">
            Google 계정으로 로그인
          </button>
        </form>
        <a className="muted small" href="/privacy">
          개인정보처리방침
        </a>
      </div>
    </main>
  );
}
