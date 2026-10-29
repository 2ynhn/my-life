// 긴 목록 위: 해마다 바로 가는 칩 (스크롤을 따라 위에 붙어 있음). 목록이 짧으면 아무것도 안 그린다

/** 목록이 이 정도는 돼야 점프가 쓸모 있다 */
export const JUMP_MIN_ITEMS = 20;

export const yearAnchor = (prefix: string, year: string) => `${prefix}-${year}`;

export function YearJump({ years, prefix }: { years: string[]; prefix: string }) {
  if (years.length < 2) return null;
  return (
    <nav className="year-jump" aria-label="연도로 이동">
      {years.map((y) => (
        <a key={y} href={`#${yearAnchor(prefix, y)}`}>
          {y}
        </a>
      ))}
    </nav>
  );
}
