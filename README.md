# my-life

각자의 Google Drive에 있는 `my-life` 폴더의 마크다운 일기를 웹에서 읽고 쓰는 앱입니다.
옵시디언 없이 Drive를 저장소(DB)처럼 씁니다. 하나의 주소에서 여러 사람이 **각자 자기 Drive**로 씁니다.

- 누구나 구글 계정으로 로그인 → 내 Drive의 `my-life` 폴더가 내 일기장 (없으면 한 번에 만들기, 여러 개면 고르기)
- 폴더 트리, frontmatter(date·tags 등) 표시, 표·체크박스(GFM), 옵시디언 `![[사진.jpg]]`·`[[노트|별칭]]`
- 편집기 + 실시간 미리보기, Ctrl+S, 새 글(템플릿), 이름 바꾸기, 휴지통, 오늘 일기 쓰기(`daily/<올해>`)
  - 편집 중 Drive·Claude 쪽에서 같은 파일이 바뀌면 덮어쓰기 전에 알려 줌 (내용 md5 비교)
  - 입력 내용은 브라우저에 자동 임시저장
  - 사진: 버튼·붙여넣기·끌어다 놓기 → 가까운 `attachments` 폴더에 `2026-10-27 21.58.33.jpg` 형식으로 저장
    (휴대폰 사진은 브라우저에서 긴 변 2000px JPEG로 줄여서 올림. 위치 정보 등 EXIF는 빠짐)
- 검색(조사·단어 일부도 찾음), #태그 모아보기, 캘린더, 첫 화면 '지난 오늘'
- Drive·Claude 쪽에서 고친 내용은 30초 안에 반영 (Drive 변경 목록으로 바뀐 것만 확인)
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

## 템플릿

새 글은 일기장의 `_templates/<최상위 폴더 이름>.md` → `_templates/default.md` → 내장 기본값 순서로 시작합니다.
`{{date}}`는 오늘 날짜(한국 시간)로 바뀝니다. `_`로 시작하는 폴더는 목록에 보이지 않습니다.
