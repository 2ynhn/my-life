import type { FeatureKey } from "@/lib/features";

// 기기에 받아 두는 일기장 목록 (서버 /api/local → 브라우저 IndexedDB). 브라우저·서버 공용 타입

export type LocalEntry = {
  id: string;
  /** 부모 폴더 id (일기장 맨 위는 null) */
  p: string | null;
  /** Drive 이름 */
  n: string;
  /** 주소에 쓰는 이름 (같은 이름이 있으면 ~id가 붙음) */
  s: string;
  k: "d" | "f";
  /** 수정 시각 */
  m: string;
  /** 앱 주소 */
  h: string;
  /** 목록에 보이는지 (md 글, attachments·_ 아닌 폴더) */
  v?: 1;
  /** md 글 */
  md?: 1;
  /** 그림 등 첨부 파일 주소 */
  u?: string;
  /** Drive 권한: 고치기 · 안에 만들기 */
  e?: 1;
  a?: 1;
  /** 접근 제한 폴더 */
  r?: 1;
};

export type LocalTree = {
  rootId: string;
  name: string;
  base: string;
  /** 내 일기장인지, 아니면 공유해 준 사람 */
  own: boolean;
  owner: string;
  /** 맨 위 폴더 id → 쓰임새 (일기·구매·여행·건강·음식) */
  kinds: Record<string, FeatureKey | null>;
  entries: LocalEntry[];
};

export type LocalText = { id: string; m: string; t: string };
