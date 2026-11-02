import { setFields } from "@/lib/frontmatter-edit";

// 새 글 템플릿 (서버·브라우저 공용). Drive의 _templates/<맨 위 폴더 이름>.md가 있으면 그것이 먼저다.

export const TEMPLATE_FOLDER = "_templates";

/** 폴더마다 두는 서식 파일. 그 폴더(와 하위 폴더)의 새 글은 가장 가까운 이 파일로 시작한다 */
export const FOLDER_TEMPLATE = "_template.md";
export const isTemplateFile = (name: string) => name.toLowerCase() === FOLDER_TEMPLATE;

export const DEFAULT_TEMPLATE = `---
date: {{date}}
written: {{date}}
title: ""
tags: []
---

# {{title}}

`;

/** 지출 기록: 영수증 한 장 = 글 하나. amount가 있으면 지출 요약·영수증 자동 입력이 켜진다 */
export const PURCHASE_TEMPLATE = `---
date: {{date}}
store: ""            # 가게·쇼핑몰 이름
amount: 0            # 총액, 원 단위 숫자만 (쉼표 없이). 환불은 음수
category: 식비        # 식비 · 외식 · 생활용품 · 의류 · 의료 · 교육 · 교통 · 문화/여가 · 경조사 · 기타
payment: ""          # 신한카드, 현금, 네이버페이 …
items:               # 선택: 품목별로 적고 싶을 때만
  - name: ""
    price: 0
tags: []
---

# {{title}}

메모:
`;

/** 여행 한 번 = 글 하나. places에 좌표가 있으면 지도에 나온다 (편집기의 '장소 추가'로 채우기) */
export const TRAVEL_TEMPLATE = `---
title: ""
start: {{date}}      # 출발일
end: {{date}}        # 돌아온 날
places:              # 들른 곳 (지도에 표시). 편집기의 '장소 추가'로 넣으면 좌표까지 채워짐
companions: []       # 함께 간 사람
tags: []
---

# {{title}}

## 1일차

`;

/** 하루 = 글 하나. 숫자 항목은 자동으로 그래프가 된다 (항목을 새로 추가해도 됨) */
export const HEALTH_TEMPLATE = `---
date: {{date}}
weight:              # 체중 kg
bp_sys:              # 혈압 수축기 mmHg
bp_dia:              # 혈압 이완기 mmHg
glucose:             # 공복 혈당 mg/dL
checkup: ""          # 건강검진이면 기관·종류 (예: 국가건강검진)
tags: []
---

메모:
`;

/** 음식 한 번 = 글 하나. 사진을 공유하거나 올리면 찍은 곳이 place에 들어간다 (지도에 표시) */
export const FOOD_TEMPLATE = `---
date: {{date}}
restaurant: ""       # 식당 이름
menu: []             # 먹은 메뉴
price: 0             # 가격, 원 단위 숫자
rating:              # 별점 1~5 (선택)
place:               # 위치 (사진을 올리면 자동, '장소 추가'로도)
people: []           # 함께 먹은 사람
tags: []
---

# {{title}}

`;

/** Drive에 템플릿이 없을 때 최상위 폴더 이름별 내장 템플릿 */
export const BUILTIN_TEMPLATES: Record<string, string> = {
  purchase: PURCHASE_TEMPLATE,
  travel: TRAVEL_TEMPLATE,
  health: HEALTH_TEMPLATE,
  food: FOOD_TEMPLATE,
};


/** 공유한 사진으로 새 여행: 돌아온 날(end)을 사진 날짜로 */
export function withEnd(text: string, end?: string): string {
  if (!end || !/^end:/m.test(text)) return text;
  try {
    return setFields(text, { end });
  } catch {
    return text;
  }
}
