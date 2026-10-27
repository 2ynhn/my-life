import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { resolveRole } from "@/lib/guests";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    // 허용 목록(환경변수 + 설정 화면의 게스트)에 있는, 구글이 확인한 이메일만 로그인 가능
    async signIn({ profile }) {
      return profile?.email_verified === true && (await resolveRole(profile.email)) !== null;
    },
  },
});
