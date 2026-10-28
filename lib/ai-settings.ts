import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { readSettingsJson, writeSettingsJson, type DriveIndex } from "@/lib/drive";

// 영수증 자동 입력에 쓰는 Anthropic API 키는 '각자' 자기 일기장의 _settings/ai.json에 둔다.
// → 쓰는 사람 본인 키로만 비용이 나가고, 서버에는 아무것도 저장하지 않는다.
// 키는 AUTH_SECRET에서 뽑은 열쇠로 암호화해서 넣는다(사람마다 다른 열쇠). 일기장을 공유받은 사람이
// 파일을 열어도 암호문만 보이고, AUTH_SECRET 없이는 풀 수 없다.

export const AI_MODELS = {
  "claude-opus-5-5": "Claude Opus 5.5 (정확, 한 장 약 30~40원)",
  "claude-haiku-5-5": "Claude Haiku 5.5 (저렴, 한 장 약 1원)",
} as const;
export type AiModel = keyof typeof AI_MODELS;
export const DEFAULT_MODEL: AiModel = "claude-opus-5-5";

type Stored = { version: 1; model: AiModel; key: string | null; keyHint: string };
export type AiSettings = { model: AiModel; hasKey: boolean; keyHint: string };

const FILE = "ai.json";

function cryptoKey(email: string): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET 환경변수가 없습니다.");
  return Buffer.from(hkdfSync("sha256", secret, "my-life-ai-key", email.toLowerCase(), 32));
}

function encrypt(email: string, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cryptoKey(email), iv);
  cipher.setAAD(Buffer.from(email.toLowerCase()));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64")}`;
}

function decrypt(email: string, sealed: string): string | null {
  try {
    const raw = Buffer.from(sealed.replace(/^v1:/, ""), "base64");
    const decipher = createDecipheriv("aes-256-gcm", cryptoKey(email), raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(email.toLowerCase()));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null; // AUTH_SECRET이 바뀌었거나 다른 사람 파일
  }
}

const isModel = (m: unknown): m is AiModel => typeof m === "string" && m in AI_MODELS;

async function readStored(index: DriveIndex): Promise<Stored | null> {
  const s = await readSettingsJson<Partial<Stored>>(index, FILE);
  if (!s) return null;
  return { version: 1, model: isModel(s.model) ? s.model : DEFAULT_MODEL, key: s.key ?? null, keyHint: s.keyHint ?? "" };
}

/** 화면용: 키 자체는 돌려주지 않는다 */
export async function getAiSettings(index: DriveIndex): Promise<AiSettings> {
  const s = await readStored(index);
  const hasKey = !!s?.key && decrypt(index.user.email, s.key) !== null;
  return { model: s?.model ?? DEFAULT_MODEL, hasKey, keyHint: hasKey ? (s?.keyHint ?? "") : "" };
}

/** 서버에서만: 영수증을 읽을 때 쓸 키와 모델 */
export async function getAiCredentials(index: DriveIndex): Promise<{ apiKey: string; model: AiModel } | null> {
  const s = await readStored(index);
  const apiKey = s?.key ? decrypt(index.user.email, s.key) : null;
  return apiKey ? { apiKey, model: s!.model } : null;
}

/** apiKey: 새 키(문자열) · 그대로(undefined) · 지우기(null) */
export async function saveAiSettings(index: DriveIndex, change: { apiKey?: string | null; model: AiModel }) {
  const current = await readStored(index);
  let key = current?.key ?? null;
  let keyHint = current?.keyHint ?? "";
  if (change.apiKey === null) {
    key = null;
    keyHint = "";
  } else if (typeof change.apiKey === "string") {
    key = encrypt(index.user.email, change.apiKey);
    keyHint = `${change.apiKey.slice(0, 7)}…${change.apiKey.slice(-4)}`;
  }
  const stored: Stored = { version: 1, model: change.model, key, keyHint };
  await writeSettingsJson(index, FILE, stored);
}
