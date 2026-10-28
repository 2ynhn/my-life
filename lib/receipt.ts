import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AiModel } from "@/lib/ai-settings";
import { anthropicClient, askJson } from "@/lib/claude";
import { CATEGORIES, type Receipt } from "@/lib/receipt-shape";

// 영수증·주문내역 이미지에서 지출 기록 항목만 뽑는다. 구조화된 출력으로 형식을 고정한다.

/** 분류 목록은 일기장마다 다를 수 있어 그때그때 스키마를 만든다 */
const schemaFor = (categories: string[]) => ({
  type: "object",
  additionalProperties: false,
  required: ["date", "store", "amount", "category", "payment", "items"],
  properties: {
    date: { type: "string", description: "구매 날짜 YYYY-MM-DD. 알 수 없으면 빈 문자열" },
    store: { type: "string", description: "가게·쇼핑몰 이름 (지점명은 짧게)" },
    amount: { type: "integer", description: "실제 결제한 총액(원). 할인 반영 후 최종 금액. 환불이면 음수" },
    category: { type: "string", enum: categories },
    payment: { type: "string", description: "결제 수단 (예: 신한카드, 현금, 네이버페이). 알 수 없으면 빈 문자열" },
    items: {
      type: "array",
      description: "품목과 금액. 읽기 어려우면 빈 배열",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "price"],
        properties: { name: { type: "string" }, price: { type: "integer" } },
      },
    },
  },
});

const SYSTEM = `당신은 한국 영수증과 온라인 쇼핑 주문내역 캡처를 읽어 가계부 항목을 채우는 도우미입니다.
- 금액은 원 단위 정수로, 쉼표·'원' 없이 적습니다. 총액은 할인·포인트 사용 후 실제로 결제한 금액입니다.
- 이미지에서 보이지 않는 정보는 지어내지 말고 빈 값으로 둡니다.
- category는 주어진 목록에서 가장 알맞은 하나를 고릅니다 (예: 식당·카페는 외식, 마트 장보기는 식비 — 목록에 있을 때). 마땅한 것이 없으면 '기타'(있다면).
- 카드번호·승인번호 같은 민감한 숫자는 어떤 칸에도 적지 않습니다.`;

/** 예전 이름 그대로 (영수증 쪽 오류) */
export { AiError as ReceiptError } from "@/lib/claude";

type ImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export async function readReceipt(
  apiKey: string,
  model: AiModel,
  image: Uint8Array,
  mediaType: ImageType,
  categories: string[] = [...CATEGORIES],
): Promise<Receipt> {
  const raw = await askJson<Partial<Receipt>>(apiKey, model, {
    system: SYSTEM,
    schema: schemaFor(categories),
    // 단순 추출이라 깊게 생각할 필요가 없다
    effort: "low",
    maxTokens: 8000,
    refusal: "이 이미지는 읽을 수 없습니다.",
    content: [
      { type: "image", source: { type: "base64", media_type: mediaType, data: Buffer.from(image).toString("base64") } },
      { type: "text", text: "이 영수증(또는 주문내역)의 가계부 항목을 채워 주세요." },
    ],
  });
  // 구조화된 출력이 형식을 지켜 주지만, 화면에 넣기 전에 한 번 더 다듬는다
  const date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : "";
  const int = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 0);
  return {
    date,
    store: String(raw.store ?? "").trim().slice(0, 80),
    amount: int(raw.amount),
    category: categories.includes(String(raw.category)) ? String(raw.category) : categories.includes("기타") ? "기타" : categories[0],
    payment: String(raw.payment ?? "").trim().slice(0, 40),
    items: (Array.isArray(raw.items) ? raw.items : [])
      .slice(0, 100)
      .map((it) => ({ name: String(it?.name ?? "").trim().slice(0, 80), price: int(it?.price) }))
      .filter((it) => it.name),
  };
}

/** 설정 화면에서 키를 저장하기 전에 확인 (토큰을 쓰지 않는 모델 정보 조회) */
export async function checkApiKey(apiKey: string, model: AiModel): Promise<string | null> {
  try {
    await anthropicClient(apiKey, { maxRetries: 0, timeout: 15_000 }).models.retrieve(model);
    return null;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return "API 키가 올바르지 않습니다.";
    if (e instanceof Anthropic.NotFoundError || e instanceof Anthropic.PermissionDeniedError)
      return "이 API 키로는 선택한 모델을 쓸 수 없습니다.";
    if (e instanceof Anthropic.APIError) return `키를 확인하지 못했습니다 (${e.status ?? "연결 실패"}).`;
    return "키를 확인하지 못했습니다.";
  }
}
