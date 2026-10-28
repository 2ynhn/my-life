// 공유하기는 보통 서비스 워커(public/sw.js)가 받아 브라우저 안에서 처리한다.
// 앱을 막 설치해 서비스 워커가 아직 준비되지 않았을 때만 여기로 온다 → 다시 공유해 달라고 안내 (받은 내용은 버림).

export async function POST(req: Request) {
  return Response.redirect(new URL("/share?retry=1", req.url), 303);
}

export async function GET(req: Request) {
  return Response.redirect(new URL("/share", req.url), 303);
}
