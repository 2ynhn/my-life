// 건강 기록 항목 (입력 폼·그래프 공용). 앞머리 이름 → 한글 이름·단위.
// ref는 흔히 쓰는 '참고 범위'를 안내하는 글일 뿐, 진단 기준이 아니다.

export type Metric = { key: string; label: string; unit: string; digits: number; ref?: string };
export type MetricGroup = { title: string; metrics: Metric[] };

export const METRIC_GROUPS: MetricGroup[] = [
  {
    title: "자주 재는 것",
    metrics: [
      { key: "weight", label: "체중", unit: "kg", digits: 1 },
      { key: "bp_sys", label: "혈압 (수축기)", unit: "mmHg", digits: 0, ref: "참고 120 미만" },
      { key: "bp_dia", label: "혈압 (이완기)", unit: "mmHg", digits: 0, ref: "참고 80 미만" },
      { key: "glucose", label: "공복 혈당", unit: "mg/dL", digits: 0, ref: "참고 100 미만" },
      { key: "glucose_pp", label: "식후 2시간 혈당", unit: "mg/dL", digits: 0, ref: "참고 140 미만" },
      { key: "pulse", label: "맥박", unit: "회/분", digits: 0 },
    ],
  },
  {
    title: "건강검진",
    metrics: [
      { key: "hba1c", label: "당화혈색소", unit: "%", digits: 1, ref: "참고 5.7 미만" },
      { key: "chol_total", label: "총콜레스테롤", unit: "mg/dL", digits: 0, ref: "참고 200 미만" },
      { key: "ldl", label: "LDL 콜레스테롤", unit: "mg/dL", digits: 0, ref: "참고 130 미만" },
      { key: "hdl", label: "HDL 콜레스테롤", unit: "mg/dL", digits: 0, ref: "참고 40 이상" },
      { key: "tg", label: "중성지방", unit: "mg/dL", digits: 0, ref: "참고 150 미만" },
      { key: "ast", label: "AST (간)", unit: "U/L", digits: 0, ref: "참고 40 이하" },
      { key: "alt", label: "ALT (간)", unit: "U/L", digits: 0, ref: "참고 35 이하" },
      { key: "ggt", label: "감마지티피", unit: "U/L", digits: 0 },
      { key: "creatinine", label: "크레아티닌", unit: "mg/dL", digits: 2 },
      { key: "egfr", label: "eGFR (신장)", unit: "mL/min", digits: 0, ref: "참고 60 이상" },
      { key: "hemoglobin", label: "혈색소", unit: "g/dL", digits: 1 },
      { key: "waist", label: "허리둘레", unit: "cm", digits: 1 },
      { key: "bmi", label: "BMI", unit: "", digits: 1, ref: "참고 18.5~23" },
      { key: "body_fat", label: "체지방률", unit: "%", digits: 1 },
    ],
  },
  {
    title: "생활",
    metrics: [
      { key: "sleep", label: "수면", unit: "시간", digits: 1 },
      { key: "steps", label: "걸음", unit: "보", digits: 0 },
    ],
  },
];

export const METRICS: Record<string, Metric> = Object.fromEntries(
  METRIC_GROUPS.flatMap((g) => g.metrics).map((m) => [m.key, m]),
);
export const METRIC_ORDER = Object.keys(METRICS);

/** 숫자가 아닌 건강 기록 칸 (그래프에서 뺀다) */
export const HEALTH_TEXT_KEYS = new Set(["date", "year", "month", "day", "checkup", "hospital", "exercise", "tags", "memo"]);
