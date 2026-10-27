import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { roleFor, type Role } from "@/lib/access";

export type AppUser = { email: string; name: string | null; image: string | null; role: Role };

/** 로그인 + 허용 목록 확인. 역할은 매 요청마다 환경변수로 다시 계산하므로 목록에서 빼면 바로 차단된다. */
export async function getUser(): Promise<AppUser | null> {
  const fake = process.env.NODE_ENV !== "production" ? process.env.DEV_FAKE_USER : undefined;
  if (fake) {
    const role = roleFor(fake);
    return role ? { email: fake, name: "개발용 사용자", image: null, role } : null;
  }

  const session = await auth();
  const email = session?.user?.email;
  const role = roleFor(email);
  if (!email || !role) return null;
  return { email, name: session.user?.name ?? null, image: session.user?.image ?? null, role };
}

export async function requireUser(): Promise<AppUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
