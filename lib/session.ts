import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Role } from "@/lib/access";
import { resolveRole } from "@/lib/guests";

export type AppUser = { email: string; name: string | null; image: string | null; role: Role };

/** 로그인 + 허용 목록 확인. 역할은 매 요청마다 다시 계산하므로 목록에서 빼면 바로(설정 화면 게스트는 1분 안에) 차단된다. */
export async function getUser(): Promise<AppUser | null> {
  const fake = process.env.NODE_ENV !== "production" ? process.env.DEV_FAKE_USER : undefined;
  if (fake) {
    const role = await resolveRole(fake);
    return role ? { email: fake, name: "개발용 사용자", image: null, role } : null;
  }

  const session = await auth();
  const email = session?.user?.email;
  const role = await resolveRole(email);
  if (!email || !role) return null;
  return { email, name: session.user?.name ?? null, image: session.user?.image ?? null, role };
}

export async function requireUser(): Promise<AppUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
