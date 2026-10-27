import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { roleFor } from "@/lib/access";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    // 허용 목록에 있는, 구글이 확인한 이메일만 로그인 가능
    signIn({ profile }) {
      return profile?.email_verified === true && roleFor(profile.email) !== null;
    },
  },
});
