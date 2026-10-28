# my-life

각자의 Google Drive에 있는 `my-life` 폴더의 마크다운 일기를 웹에서 읽고 쓰는 앱입니다.
옵시디언 없이 Drive를 저장소(DB)처럼 씁니다. 하나의 주소에서 여러 사람이 **각자 자기 Drive**로 씁니다.

- 첫 화면은 쓰임새별 카드(일기·구매·여행·건강) — 개수와 '오늘 일기 쓰기'·'영수증 기록' 같은 바로가기, 없는 기능은 '시작하기'로 폴더 생성
- 누구나 구글 계정으로 로그인 → 내 Drive의 `my-life` 폴더가 내 일기장 (없으면 한 번에 만들기, 여러 개면 고르기)
- 폴더 트리, frontmatter(date·tags 등) 표시, 표·체크박스(GFM), 옵시디언 `![[사진.jpg]]`·`[[노트|별칭]]`
- 편집기 + 실시간 미리보기, Ctrl+S, 새 글(템플릿), 이름 바꾸기, 휴지통, 오늘 일기 쓰기(`daily/<올해>`)
- 새 폴더: 폴더 화면의 '새 폴더', 첫 화면 '다른 폴더' 옆 (`_`로 시작하는 이름·attachments는 앱이 숨기는 이름이라 막음)
  - 편집 중 Drive·Claude 쪽에서 같은 파일이 바뀌면 덮어쓰기 전에 알려 줌 (내용 md5 비교)
  - 입력 내용은 브라우저에 자동 임시저장
  - 사진: 버튼·붙여넣기·끌어다 놓기 → 가까운 `attachments` 폴더에 `2026-10-27 21.58.33.jpg` 형식으로 저장
    (휴대폰 사진은 브라우저에서 긴 변 2000px JPEG로 줄여서 올림. 위치 정보 등 EXIF는 빠짐)
- 검색(조사·단어 일부도 찾음), #태그 모아보기, 캘린더, 첫 화면 '지난 오늘'
- Drive·Claude 쪽에서 고친 내용은 30초 안에 반영 (Drive 변경 목록으로 바뀐 것만 확인)
- 지출 기록(purchase): 영수증 사진으로 자동 입력, 월별·분류별 합계 차트
- 여행(travel): 다녀온 곳 지도 + 해마다 묶은 여행 타임라인, 편집기에서 장소 검색·현재 위치로 추가
- 건강(health): 혈압·혈당·건강검진 수치 등 숫자 항목마다 그래프 (30일·90일·1년·전체)
- 카테고리별 입력 폼: 구매(가게·금액·분류·품목), 여행(날짜·동행·장소), 건강(자주 재는 것·검진 항목·직접 추가), 일기(키워드·함께한 사람) — 자주 쓴 값 자동 완성
- 빠른 한 줄 기록: 첫 화면에서 한 줄 → 오늘 일기에 `- 14:32 내용`으로 (없으면 오늘 일기를 만듦)
- 공유하기로 저장 (안드로이드 설치 앱): 캡처 이미지 → 영수증 읽기, 글·링크 → 오늘 일기에 한 줄
- 모아보기: 사람별, 가게·여행 장소별, 반복 구매(품목 주기·정기 결제), 구매 예산
- Claude에게 물어보기: "작년 제주에서 간 식당?"처럼 물으면 기록을 찾아 읽고 근거 글과 함께 답함 (각자 API 키)
- 홈 화면에 앱으로 설치 가능 (PWA)

로드맵은 [docs/ROADMAP.md](docs/ROADMAP.md) 참고.

## 구조: 서버에 아무것도 저장하지 않는다

```
브라우저 ──(암호화된 로그인 쿠키: 그 사람의 Drive refresh token)──▶ Next.js 서버 ──(그 사람의 토큰)──▶ Google Drive
```

- **본인 접근**: 로그인할 때 Drive 권한과 refresh token을 받아 Auth.js 로그인 쿠키(httpOnly, `AUTH_SECRET`으로 암호화) 안에만
  보관합니다. 서버는 요청마다 그 쿠키에서 꺼낸 **그 사람의 토큰**으로 Drive를 부릅니다. DB·KV 없음.
  `/api/auth/session` 응답에는 토큰을 넣지 않아 브라우저 자바스크립트는 볼 수 없습니다.
- **게스트 접근 = Drive 공유**: 설정 화면에서 이메일을 초대하면 앱이 내 토큰으로 `my-life` 폴더를 Drive에서 공유하고,
  Drive가 초대 메일(앱 주소 포함)을 보냅니다. 게스트는 자기 계정으로 로그인해 **자기 토큰으로** 읽습니다.
  - 보기 권한 → 읽기만, 편집 권한 → 앱에서도 글쓰기·수정 (삭제는 Drive 규칙상 파일 소유자만)
  - 해제하면 Drive 공유가 끊겨 내용은 즉시, 목록은 30초 안에 막힘. Drive 앱에서 공유를 바꿔도 똑같이 적용
- **게스트에게 숨길 폴더 = Drive 접근 제한**: 설정 화면에서 폴더의 Drive '접근 제한'(`inheritedPermissionsDisabled`)을 켜면
  일기장을 공유받은 사람도 그 폴더를 열 수 없습니다(Drive 웹에서도). 예전 `.private` 파일 규칙은 더 이상 쓰지 않습니다.
- 앱은 권한을 따로 판단하지 않고, Drive가 알려 주는 `capabilities`로 버튼을 보일지만 정합니다. 앱에 버그가 있어도
  Drive가 허락하지 않은 것은 읽거나 쓸 수 없습니다.

주소: 일기장마다 `/d/<폴더ID>/…`. `/`는 내 일기장으로, 예전 주소(`/daily/…`)는 내 일기장의 같은 경로로 넘어갑니다.
게스트에게 보낼 초대 주소는 설정 화면에 있습니다.

## 설정

1. GCP에서 Drive API 사용, OAuth 동의 화면(외부, **프로덕션 게시**, 범위에 `…/auth/drive` 포함), 웹 클라이언트 생성
   - 승인된 JavaScript 원본: `http://localhost:3000`, `https://my-life-zeta-seven.vercel.app`
   - 승인된 리디렉션 URI: `http://localhost:3000/api/auth/callback/google`, `https://my-life-zeta-seven.vercel.app/api/auth/callback/google`
2. 환경변수 `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (`.env.example` 참고)

`AUTH_SECRET` 생성 (Windows PowerShell):

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

> 구글 심사를 받지 않은 앱이라 로그인할 때 "확인되지 않은 앱" 경고가 뜨고, 사용자는 최대 100명입니다.
> 게스트도 처음 로그인할 때 Drive 접근에 동의해야 합니다.

## 로컬 개발: 가짜 Drive 서버

실제 구글 없이 여러 사람의 Drive와 공유·접근 제한까지 시험할 수 있습니다.

```bash
npm install
npm run fake-drive -- --lib me@example.com=./sample-drive --lib mom@example.com=./mom-drive   # :4010
# .env.local
#   AUTH_SECRET=아무거나
#   DEV_GOOGLE_API_BASE=http://localhost:4010
#   DEV_FAKE_USER=me@example.com
npm run dev
```

브라우저에서 `dev-user` 쿠키를 다른 이메일로 바꾸면 그 사람으로 보입니다. (production 빌드에서는 무시됨)

## 지출 기록과 영수증 자동 입력

`purchase` 폴더(또는 `_templates/<폴더>.md`에 `amount:`가 있는 폴더)는 지출 기록 폴더가 됩니다.

- 형식: 영수증 한 장 = 글 하나, 파일 이름 `2026-10-28 이마트.md`, 앞머리에 `date` `store` `amount`(원, 숫자) `category`
  (식비 · 외식 · 생활용품 · 의류 · 의료 · 교육 · 교통 · 문화/여가 · 경조사 · 기타) `payment` `items`
- 폴더 화면 위에 이달·올해 합계, 월별 막대, 분류별 막대, 이달 목록
- 새 글의 **📷 카메라로 읽기**: 앱 안에서 카메라를 열어 찍으면 Claude가 항목을 채우고, 확인 후 저장
  - 찍은 장면은 메모리에서 바로 보내고 **파일을 만들지 않음** (갤러리·Drive·서버 어디에도 안 남음)
  - **🖼 이미지로 읽기**: 주문내역 캡처 등 이미 있는 이미지. 이것도 올리지 않고 읽기만
  - 원본이 필요하면 '이미지도 글에 첨부'를 켜면 `attachments`에 저장
  - **설정 → 영수증 자동 입력**에서 각자 자기 Anthropic API 키와 모델(Opus 5.5 정확 / Haiku 5.5 저렴)을 정합니다
  - 키는 내 Drive `my-life/_settings/ai.json`에 `AUTH_SECRET`으로 암호화해 저장 → 서버엔 남지 않고, 비용은 각자 키로
  - 사람마다 10분에 30장까지

## 여행

`travel` 폴더(또는 템플릿에 `places:`가 있는 폴더)는 여행 폴더가 됩니다. 여행 하나 = 글 하나.

```yaml
title: 제주 가족여행
start: 2025-05-03
end: 2025-05-06
places:
  - { name: 성산일출봉, date: 2025-05-03, lat: 33.4581, lng: 126.9425 }
  - 불국사            # 이름만 적어도 됨 (지도에는 안 나오고 목록에만)
companions: [엄마, 동생]
```

- 폴더 화면: 모든 여행의 장소를 한 지도에, 아래에 연도별 타임라인 (기간·일수·동행·들른 곳)
- 여행 글: 들른 순서대로 점선으로 이은 지도
- 편집기의 **📍 장소 추가**: 이름으로 찾거나(OpenStreetMap) **지금 있는 곳**(휴대폰 위치)을 넣으면 좌표까지 한 줄로 들어감
  - 검색·지도는 브라우저가 OpenStreetMap에 바로 묻습니다 (이 앱 서버를 거치지 않음, API 키 필요 없음)

## 건강

`health` 폴더(또는 템플릿에 `weight:`·`sleep:`·`steps:` 중 하나가 있는 폴더)는 건강 기록 폴더가 됩니다. 하루 = 글 하나.

- 앞머리의 **숫자** 항목마다 선 그래프 하나 (`weight` 체중 · `sleep` 수면 · `steps` 걸음 · `bp_sys`/`bp_dia` 혈압 · `condition` 컨디션 1~5)
- 처음 보는 숫자 항목(`water: 1.5` 등)을 더해도 그대로 그래프가 생김. 비워 둔 칸은 건너뜀
- 기간 30일 · 90일(기본) · 1년 · 전체, 점을 누르면 그날 글로, '최근 기록 표로 보기'

## 건강 항목

앞머리 이름 → 화면 이름: `weight` 체중 · `bp_sys`/`bp_dia` 혈압 · `glucose` 공복 혈당 · `glucose_pp` 식후 혈당 · `pulse` 맥박 ·
`hba1c` 당화혈색소 · `chol_total` 총콜레스테롤 · `ldl` · `hdl` · `tg` 중성지방 · `ast` · `alt` · `ggt` · `creatinine` · `egfr` ·
`hemoglobin` · `waist` · `bmi` · `body_fat` · `sleep` · `steps`. 그 밖의 숫자 칸(`요산: 6.1` 등)도 그대로 그래프가 됩니다.
`checkup`(검진 기관·종류)은 글자 칸. 참고 범위는 안내일 뿐 진단 기준이 아닙니다.

## 물어보기 (Claude)

1. 질문을 Claude가 검색어·기간·종류로 바꾸고 → 2. 일기장을 훑어 관련 글(최대 30개)을 모은 뒤 → 3. 그 글들만 근거로 답합니다 (`[1]` 출처 링크).
글은 묻는 사람의 Drive 권한으로 읽고, 비용은 묻는 사람 자기 키로 나갑니다. 질문·답은 저장하지 않습니다. 사람마다 10분에 20번.

## 공유하기

`app/manifest.ts`의 `share_target` + `public/sw.js`(서비스 워커). 받은 이미지·글은 브라우저 Cache Storage에만 잠깐 두고
`/share` 화면에서 영수증 읽기(구매 새 글) 또는 오늘 일기 한 줄로 넘깁니다. 서버·Drive에 파일을 만들지 않습니다. 아이폰 사파리는 지원하지 않습니다.

## 템플릿

새 글은 일기장의 `_templates/<최상위 폴더 이름>.md` → 내장 템플릿(purchase·travel·health) → `_templates/default.md` → 내장 기본값 순서로 시작합니다.
`{{date}}`는 오늘 날짜(한국 시간)로 바뀝니다. `_`로 시작하는 폴더는 목록에 보이지 않습니다.
