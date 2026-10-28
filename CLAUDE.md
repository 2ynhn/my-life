# 작업 규칙

- 설명과 답변은 한국어로 한다.
- 작업은 브랜치에서 하고, 끝나면 따로 지시가 없어도 `main`에 합쳐서 푸시한다 (Vercel이 main을 자동 배포).
- Next.js 16: 코드를 쓰기 전에 `AGENTS.md` 안내대로 `node_modules/next/dist/docs/`를 확인한다.
- Drive 권한은 앱이 판단하지 않는다. 모든 Drive 호출은 로그인한 사람 본인의 토큰으로 하고, 버튼 표시는 Drive `capabilities`를 따른다.
- 로컬 확인은 `scripts/fake-drive.mjs`(가짜 Drive 서버)로 한다. README의 '로컬 개발' 참고.
