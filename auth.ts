import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DRIVE_SCOPE } from "@/lib/google";

// 누구나 자기 구글 계정으로 로그인해서 자기 Drive를 쓴다.
// 로그인할 때 Drive 권한과 refresh token을 받아, 암호화된 로그인 쿠키(JWT) 안에만 보관한다.
// 세션 응답(/api/auth/session)에는 넣지 않아 브라우저 자바스크립트는 토큰을 볼 수 없다.

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          scope: `openid email profile ${DRIVE_SCOPE}`,
          access_type: "offline",
          // 매번 동의를 받아야 refresh token이 항상 온다
          prompt: "consent",
        },
      },
    }),
  ],
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    signIn({ profile, account }) {
      if (profile?.email_verified !== true) return false;
      // 동의 화면에서 Drive 체크를 해제하면 앱을 쓸 수 없다
      if (!account?.scope?.split(" ").includes(DRIVE_SCOPE) || !account.refresh_token) return "/login?error=DriveScope";
      return true;
    },
    jwt({ token, account }) {
      if (account?.refresh_token) token.rt = account.refresh_token;
      return token;
    },
    // 기본 session 콜백은 이름·이메일·사진만 내보낸다 (rt는 빠짐)
  },
});
