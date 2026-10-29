import { parseDocument } from "yaml";

// 영수증 항목의 모양과, 읽은 결과를 편집기 글(템플릿)에 채워 넣는 일. 브라우저·서버 공용.

/** 기본 분류. 각 일기장은 구매 화면의 '분류 관리'로 바꿀 수 있다 (_settings/categories.json) */
export const CATEGORIES = ["식비", "외식", "생활용품", "의류", "의료", "교육", "교통", "문화/여가", "경조사", "기타"] as const;

/** 분류 목록 다듬기: 앞뒤 공백·빈 것·중복 빼고, 이름 30자·40개까지 */
export function cleanCategories(list: unknown): string[] {
  const out: string[] = [];
  for (const v of Array.isArray(list) ? list : []) {
    const name = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
    if (name && !/[#:\[\]{}]/.test(name) && !out.includes(name)) out.push(name);
  }
  return out.slice(0, 40);
}

export type Receipt = {
  date: string; // YYYY-MM-DD, 모르면 ""
  store: string;
  amount: number; // 원 단위 총액
  category: string;
  payment: string;
  items: { name: string; price: number }[];
};

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * 템플릿 앞머리(YAML)의 값만 바꾸고 주석·순서는 그대로 둔다.
 * 제목이 비어 있으면 가게 이름으로. imageName을 주면 본문에 영수증 이미지를 붙인다.
 */
export function fillReceipt(text: string, r: Receipt, imageName?: string): string {
  const m = FRONT.exec(text);
  const doc = parseDocument(m ? m[1] : "");
  if (r.date) doc.set("date", r.date);
  if (r.store) doc.set("store", r.store);
  doc.set("amount", r.amount);
  doc.set("category", r.category);
  if (r.payment) doc.set("payment", r.payment);
  doc.set("items", r.items.length ? r.items : []);

  let body = m ? text.slice(m[0].length) : text;
  if (r.store) body = body.replace(/^#[ \t]*$/m, `# ${r.store}`);
  if (imageName && !body.includes(`![[${imageName}]]`)) body = `${body.replace(/\s*$/, "")}\n\n![[${imageName}]]\n`;
  return `---\n${doc.toString()}---\n${body}`;
}

/** 새 글 파일 이름 제안: 2026-10-28 우유 (첫 품목, 없으면 가게) */
export const receiptFileName = (r: Receipt, fallbackDate: string) =>
  `${r.date || fallbackDate} ${r.items.find((i) => i.name?.trim())?.name ?? r.store}`.replace(/[\/\\\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim();
