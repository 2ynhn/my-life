import { isScalar, isSeq, parseDocument, type Document } from "yaml";

// 편집기 글의 앞머리(YAML)를 주석·순서를 지키며 고친다 (브라우저용)

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function open(text: string): { doc: Document; body: string } {
  const m = FRONT.exec(text);
  const doc = parseDocument(m ? m[1] : "");
  if (doc.errors.length) throw new Error(doc.errors[0].message);
  return { doc, body: m ? text.slice(m[0].length) : `\n${text}` };
}
const close = (doc: Document, body: string) => `---\n${doc.toString({ flowCollectionPadding: false })}---\n${body}`;

/** 앞머리 값 (형식이 깨졌으면 null) */
export function readMeta(text: string): Record<string, unknown> | null {
  try {
    const m = FRONT.exec(text);
    if (!m) return {};
    const doc = parseDocument(m[1]);
    if (doc.errors.length) return null;
    const v = doc.toJS() as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return null;
  }
}

export type FieldValue = string | number | null | string[] | Record<string, unknown>[] | Record<string, unknown>;

/**
 * 여러 칸을 한 번에 바꾼다. 글자·숫자는 기존 칸의 주석을 그대로 두고 값만 바꾼다.
 * 글자 목록(태그·사람)은 한 줄 [a, b], 항목 목록(품목)은 여러 줄, places는 한 항목 한 줄.
 * undefined는 칸을 지운다.
 */
export function setFields(text: string, fields: Record<string, FieldValue | undefined>): string {
  const { doc, body } = open(text);
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) {
      doc.delete(key);
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      // 장소 같은 묶음은 한 줄로: place: {name: 을지면옥, lat: 37.56, lng: 126.99}
      const node = doc.createNode(value);
      node.flow = true;
      doc.set(key, node);
      continue;
    }
    if (!Array.isArray(value)) {
      doc.set(key, value);
      // 템플릿의 store: "" 처럼 따옴표였던 칸도, 값이 들어가면 보통 글자로 (필요하면 yaml이 알아서 따옴표)
      const node = doc.get(key, true);
      if (typeof value === "string" && value && isScalar(node)) node.type = "PLAIN";
      continue;
    }
    const node = doc.createNode(value);
    if (value.every((v) => typeof v === "string")) node.flow = true;
    else if (key === "places") for (const item of node.items) (item as { flow?: boolean }).flow = true;
    doc.set(key, node);
  }
  return close(doc, body);
}

/** places 목록 끝에 장소를 한 줄로 더한다: - { name: 성산일출봉, date: 2026-10-28, lat: 33.45, lng: 126.94 } */
export function addPlace(text: string, place: { name: string; date: string; lat: number; lng: number }): string {
  const { doc, body } = open(text);
  if (!isSeq(doc.get("places"))) doc.set("places", doc.createNode([]));
  const node = doc.createNode({
    name: place.name,
    date: place.date,
    lat: Math.round(place.lat * 1e5) / 1e5,
    lng: Math.round(place.lng * 1e5) / 1e5,
  });
  node.flow = true;
  doc.addIn(["places"], node);
  return close(doc, body);
}

/** 입력칸 글자 → 앞머리 값: 숫자처럼 보이면 숫자, 비면 null(칸은 남김) */
export function numberish(raw: string): number | string | null {
  const t = raw.trim().replace(/,/g, "");
  if (!t) return null;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : raw;
}
