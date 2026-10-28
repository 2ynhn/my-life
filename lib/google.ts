import "server-only";
import { createHash } from "node:crypto";

// 로그인한 사람 각자의 토큰으로 Google API를 부른다. 서버에는 아무 토큰도 저장하지 않는다
// (refresh token은 암호화된 로그인 쿠키 안에만 있고, 요청마다 거기서 꺼내 쓴다).

/** 개발 전용: 가짜 Drive 서버 주소 (scripts/fake-drive.mjs). production 빌드에서는 무시 */
const devBase = process.env.NODE_ENV !== "production" ? process.env.DEV_GOOGLE_API_BASE?.trim() : undefined;

export const API = {
  drive: devBase ? `${devBase}/drive/v3` : "https://www.googleapis.com/drive/v3",
  upload: devBase ? `${devBase}/upload/drive/v3` : "https://www.googleapis.com/upload/drive/v3",
  token: devBase ? `${devBase}/token` : "https://oauth2.googleapis.com/token",
};

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

export type DriveUser = { email: string; refreshToken: string };

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status = 500,
    readonly reason = "",
  ) {
    super(message);
  }
}

/** 토큰이 취소·만료되어 다시 로그인해야 할 때 */
export class ReauthError extends DriveError {}

const env = (name: string) => process.env[name]?.trim() || undefined;

// access token은 1시간짜리라 인스턴스 메모리에 잠깐 둔다. 키는 refresh token의 해시 → 사람마다 따로
const accessTokens = new Map<string, { value: string; expiresAt: number }>();
const keyOf = (refreshToken: string) => createHash("sha256").update(refreshToken).digest("hex");

async function accessToken(user: DriveUser): Promise<string> {
  const key = keyOf(user.refreshToken);
  const hit = accessTokens.get(key);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.value;

  const clientId = env("AUTH_GOOGLE_ID");
  const clientSecret = env("AUTH_GOOGLE_SECRET");
  if (!clientId || !clientSecret) throw new DriveError("AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET 환경변수가 비어 있습니다.");

  const res = await fetch(API.token, {
    method: "POST",
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: user.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({}))) as { error?: string };
    if (error === "invalid_grant")
      throw new ReauthError("Drive 연결이 만료되었거나 취소되었습니다. 다시 로그인하세요.", 401, error);
    if (error === "invalid_client") throw new DriveError("AUTH_GOOGLE_ID 또는 AUTH_GOOGLE_SECRET 값이 잘못되었습니다.");
    throw new DriveError(`Drive 토큰 갱신 실패 (${res.status}${error ? `, ${error}` : ""})`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  // 오래된 항목이 쌓이지 않게 가끔 정리
  if (accessTokens.size > 500) for (const [k, v] of accessTokens) if (v.expiresAt < Date.now()) accessTokens.delete(k);
  accessTokens.set(key, { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 });
  return json.access_token;
}

/** 사용자 본인 토큰으로 Drive API 호출. 실패하면 상태 코드가 담긴 DriveError */
export async function driveFetch(user: DriveUser, url: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${await accessToken(user)}` },
      cache: "no-store",
    });
    if (res.ok) return res;
    // access token이 먼저 만료된 경우 한 번만 새로 받아 다시 시도
    if (res.status === 401 && attempt === 0) {
      accessTokens.delete(keyOf(user.refreshToken));
      continue;
    }

    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; errors?: { reason?: string }[] };
    };
    const reason = body.error?.errors?.[0]?.reason ?? "";
    if (res.status === 401) throw new ReauthError("Drive 연결이 만료되었습니다. 다시 로그인하세요.", 401, reason);
    const hint =
      reason === "accessNotConfigured" || /has not been used|is disabled/.test(body.error?.message ?? "")
        ? "GCP 프로젝트에서 Google Drive API를 '사용'으로 설정하세요."
        : reason === "insufficientPermissions" || reason === "insufficientFilePermissions"
          ? "이 작업을 할 Drive 권한이 없습니다."
          : (body.error?.message ?? "");
    throw new DriveError(`Drive API 오류 (${res.status}${reason ? `, ${reason}` : ""}). ${hint}`.trim(), res.status, reason);
  }
}

export const isNotFound = (e: unknown) => e instanceof DriveError && (e.status === 404 || e.status === 403);
