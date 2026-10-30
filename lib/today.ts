/** 오늘 날짜 (한국 시간, YYYY-MM-DD). 브라우저·서버 공용 */
export const todayKST = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
