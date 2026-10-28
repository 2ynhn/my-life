import { isSeq, parseDocument } from "yaml";

// 편집기 글의 앞머리(YAML)를 주석·순서를 지키며 고친다 (브라우저용)

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** places 목록 끝에 장소를 한 줄로 더한다: - { name: 성산일출봉, date: 2026-10-28, lat: 33.45, lng: 126.94 } */
export function addPlace(text: string, place: { name: string; date: string; lat: number; lng: number }): string {
  const m = FRONT.exec(text);
  const doc = parseDocument(m ? m[1] : "");
  if (doc.errors.length) throw new Error(doc.errors[0].message);
  if (!isSeq(doc.get("places"))) doc.set("places", doc.createNode([]));
  const node = doc.createNode({
    name: place.name,
    date: place.date,
    lat: Math.round(place.lat * 1e5) / 1e5,
    lng: Math.round(place.lng * 1e5) / 1e5,
  });
  node.flow = true;
  doc.addIn(["places"], node);
  const body = m ? text.slice(m[0].length) : `\n${text}`;
  return `---\n${doc.toString()}---\n${body}`;
}
