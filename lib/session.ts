import "server-only";
import { getToken } from "next-auth/jwt";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { DriveUser } from "@/lib/google";

export type AppUser = DriveUser & { name: string | null; image: string | null };

/** 로그인한 사람과 그 사람의 Drive 토큰 (암호화된 로그인 쿠키에서 꺼냄) */
export async function getUser(): Promise<AppUser | null> {
  // 개발 전용: 가짜 Drive 서버와 함께 로그인 없이 쓰기. dev-user 쿠키로 사람을 바꿔 볼 수 있다
  const fake = process.env.NODE_ENV !== "production" ? process.env.DEV_FAKE_USER : undefined;
  if (fake) {
    const email = (await cookies()).get("dev-user")?.value || fake;
    return { email, refreshToken: `dev:${email}`, name: email.split("@")[0], image: null };
  }

  const h = await headers();
  // https에서는 __Secure- 접두사가 붙은 쿠키 이름을 쓴다
  for (const secureCookie of [true, false]) {
    const token = await getToken({ req: { headers: h }, secret: process.env.AUTH_SECRET, secureCookie });
    if (!token) continue;
    // 예전 방식(토큰 없는) 로그인 쿠키면 다시 로그인하게 한다
    if (typeof token.email !== "string" || typeof token.rt !== "string") return null;
    return {
      email: token.email,
      refreshToken: token.rt,
      name: typeof token.name === "string" ? token.name : null,
      image: typeof token.picture === "string" ? token.picture : null,
    };
  }
  return null;
}

export async function requireUser(): Promise<AppUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
