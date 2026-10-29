// 첫 화면·사이드바에서 폴더를 '쓰임새'로 보여 주기 위한 정의 (브라우저·서버 공용, Drive 호출 없음)

export type FeatureKey = "diary" | "spending" | "travel" | "health" | "food";

export type Feature = {
  key: FeatureKey;
  label: string;
  /** 없을 때 '시작하기'로 만들 폴더 이름 */
  folder: string;
  /** 새 글 버튼 이름 */
  action: string;
  /** 폴더가 아직 없을 때 카드에 보일 설명 */
  intro: string;
};

export const FEATURES: Feature[] = [
  { key: "diary", label: "일기", folder: "daily", action: "오늘 쓰기", intro: "하루 한 편, 연도별 폴더에 쌓여요" },
  { key: "spending", label: "구매", folder: "purchase", action: "영수증 기록", intro: "영수증을 찍으면 금액·가게가 채워져요" },
  { key: "travel", label: "여행", folder: "travel", action: "새 여행", intro: "다녀온 곳을 지도와 타임라인으로" },
  { key: "health", label: "건강", folder: "health", action: "오늘 기록", intro: "체중·수면·걸음 수를 그래프로" },
  { key: "food", label: "음식", folder: "food", action: "먹은 것 기록", intro: "먹은 음식과 식당을 사진·지도로" },
];

export const featureOf = (key: FeatureKey) => FEATURES.find((f) => f.key === key)!;

const NAMES: Record<string, FeatureKey> = {
  daily: "diary",
  diary: "diary",
  일기: "diary",
  purchase: "spending",
  purchases: "spending",
  spending: "spending",
  구매: "spending",
  지출: "spending",
  travel: "travel",
  trips: "travel",
  여행: "travel",
  health: "health",
  건강: "health",
  food: "food",
  foods: "food",
  음식: "food",
  맛집: "food",
};

/** 폴더 이름만으로 아는 쓰임새 (사이드바처럼 템플릿을 읽을 수 없는 곳용) */
export const featureByName = (name: string): FeatureKey | null => NAMES[name.toLowerCase()] ?? null;
