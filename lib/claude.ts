import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AiModel } from "@/lib/ai-settings";

// Claude 호출 공용: 각자 자기 API 키로, 구조화된 출력(JSON 스키마)으로 받는다. 오류는 알기 쉬운 한국어로.

export class AiError extends Error {}

/** 개발 전용: 가짜 API 주소 (scripts/fake-drive.mjs가 흉내 냄). production에서는 무시 */
const devBaseURL = process.env.NODE_ENV !== "production" ? process.env.DEV_ANTHROPIC_BASE_URL?.trim() : undefined;

export const anthropicClient = (apiKey: string, opts: { timeout?: number; maxRetries?: number } = {}) =>
  new Anthropic({ apiKey, ...(devBaseURL ? { baseURL: devBaseURL } : {}), maxRetries: opts.maxRetries ?? 1, timeout: opts.timeout ?? 60_000 });

export async function askJson<T>(
  apiKey: string,
  model: AiModel,
  req: {
    system: string;
    content: Anthropic.Beta.BetaContentBlockParam[];
    schema: Record<string, unknown>;
    effort: "low" | "medium" | "high";
    maxTokens: number;
    /** 거절됐을 때 보여 줄 말 */
    refusal: string;
  },
): Promise<T> {
  const client = anthropicClient(apiKey);
  const params = {
    model,
    max_tokens: req.maxTokens,
    system: req.system,
    output_config: { effort: req.effort, format: { type: "json_schema" as const, schema: req.schema } },
    messages: [{ role: "user" as const, content: req.content }],
  };

  let res;
  try {
    // Opus는 안전 필터가 드물게 거절할 수 있어 서버 쪽 대체 모델(fallbacks)을 켠다. Haiku는 지원하지 않는다
    res =
      model === "claude-opus-5-5"
        ? await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
        : await client.beta.messages.create(params);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("API 키가 올바르지 않습니다. 설정에서 다시 입력하세요.");
    if (e instanceof Anthropic.PermissionDeniedError) throw new AiError("이 API 키로는 이 모델을 쓸 수 없습니다.");
    if (e instanceof Anthropic.RateLimitError) throw new AiError("API 사용 한도에 걸렸습니다. 잠시 뒤 다시 시도하세요.");
    if (e instanceof Anthropic.BadRequestError) throw new AiError(`요청을 처리하지 못했습니다: ${e.message}`);
    if (e instanceof Anthropic.APIError) throw new AiError(`Claude API 오류 (${e.status ?? "연결 실패"})`);
    throw e;
  }

  if (res.stop_reason === "refusal") throw new AiError(req.refusal);
  if (res.stop_reason === "max_tokens") throw new AiError("응답이 너무 길어 중간에 끊겼습니다. 다시 시도하세요.");
  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new AiError("응답을 읽지 못했습니다.");
  try {
    return JSON.parse(text.text) as T;
  } catch {
    throw new AiError("응답을 읽지 못했습니다.");
  }
}
