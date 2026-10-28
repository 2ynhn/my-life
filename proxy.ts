import { NextResponse, type NextRequest } from "next/server";

/**
 * 초대 주소(/d/…)를 로그인 전에 열면 로그인 뒤 그 주소로 돌아오게 next를 붙인다.
 * 쿠키가 있는지만 보는 가벼운 확인이고, 진짜 로그인 확인은 각 페이지가 한다.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.getAll().some((c) => /^(__Secure-)?authjs\.session-token/.test(c.name));
  const devUser = process.env.NODE_ENV !== "production" && process.env.DEV_FAKE_USER;
  if (hasSession || devUser) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = { matcher: "/d/:path*" };
