// 기기 사본으로 그리는 일기장 전체 화면 (서버·브라우저 공용: 서버 페이지도 이 목록으로 고른다)
export type RootViewName = "search" | "calendar" | "collect";
export const LOCAL_ROOT_VIEWS = new Set<string>(["search", "calendar", "collect"]);
