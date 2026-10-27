import "server-only";
import { emailList, roleFor, type Role } from "@/lib/access";
import { readSettingsFile, writeSettingsFile } from "@/lib/drive";

// 설정 화면에서 관리하는 게스트 목록: Drive의 _settings/guests.json
// 소유자는 여기에 없다 — 웹 화면이 뚫려도 소유자 권한은 얻을 수 없도록 OWNER_EMAILS 환경변수로만 정한다.

export type Guest = { email: string; addedAt: string };

const FILE = "guests.json";
const TTL_MS = 60 * 1000; // 게스트를 지우면 늦어도 1분 안에 차단

let cache: { guests: Guest[]; at: number } | null = null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parse(text: string): Guest[] {
  const data = JSON.parse(text) as { guests?: unknown };
  if (!Array.isArray(data.guests)) return [];
  return data.guests.flatMap((g): Guest[] => {
    const email = typeof g?.email === "string" ? g.email.trim().toLowerCase() : "";
    return EMAIL_RE.test(email) ? [{ email, addedAt: typeof g.addedAt === "string" ? g.addedAt : "" }] : [];
  });
}

async function load(): Promise<Guest[]> {
  const file = await readSettingsFile(FILE);
  return file ? parse(file.text) : [];
}

/** 캐시된 게스트 목록. Drive를 못 읽으면 아무도 게스트로 인정하지 않는다 (닫힌 쪽으로 실패) */
export async function driveGuests(): Promise<Guest[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.guests;
  try {
    cache = { guests: await load(), at: Date.now() };
  } catch (e) {
    console.error("[guests] 목록을 읽지 못함:", e);
    // 잠깐만 기억해서 요청마다 Drive를 두드리지 않게
    cache = { guests: [], at: Date.now() - TTL_MS + 10_000 };
  }
  return cache.guests;
}

/** 환경변수(소유자·게스트) → Drive 게스트 목록 순서로 역할을 정한다 */
export async function resolveRole(email: string | null | undefined): Promise<Role | null> {
  const fromEnv = roleFor(email);
  if (fromEnv || !email) return fromEnv;
  const e = email.toLowerCase();
  return (await driveGuests()).some((g) => g.email === e) ? "guest" : null;
}

export type GuestChange = { ok: true } | { ok: false; error: string };

/** 쓰기 전에는 캐시가 아닌 최신 파일을 다시 읽는다 */
async function save(mutate: (list: Guest[]) => Guest[] | string): Promise<GuestChange> {
  let current: Guest[];
  try {
    current = await load();
  } catch {
    return { ok: false, error: "게스트 목록 파일을 읽지 못했습니다. _settings/guests.json 형식을 확인하세요." };
  }
  const next = mutate(current);
  if (typeof next === "string") return { ok: false, error: next };
  await writeSettingsFile(FILE, JSON.stringify({ version: 1, guests: next }, null, 2) + "\n");
  cache = { guests: next, at: Date.now() };
  return { ok: true };
}

export function addGuest(raw: string): Promise<GuestChange> {
  const email = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return Promise.resolve({ ok: false, error: "이메일 형식이 올바르지 않습니다." });
  if (emailList(process.env.OWNER_EMAILS).includes(email))
    return Promise.resolve({ ok: false, error: "소유자 계정은 게스트로 추가할 수 없습니다." });
  return save((list) => {
    if (list.some((g) => g.email === email)) return "이미 등록된 게스트입니다.";
    if (list.length >= 50) return "게스트는 50명까지 등록할 수 있습니다.";
    return [...list, { email, addedAt: new Date().toISOString() }];
  });
}

export function removeGuest(raw: string): Promise<GuestChange> {
  const email = raw.trim().toLowerCase();
  return save((list) => (list.some((g) => g.email === email) ? list.filter((g) => g.email !== email) : "목록에 없는 이메일입니다."));
}
