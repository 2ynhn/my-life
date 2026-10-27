# my-life

Google Drive의 `my-life` 폴더에 있는 마크다운 일기를 웹에서 보는 개인용 앱입니다.
옵시디언 없이 Drive를 저장소(DB)처럼 씁니다.

- 구글 로그인 + 허용 이메일만 접근 (소유자 / 게스트)
- 폴더 트리, frontmatter(date·tags 등) 표시, 표·체크박스(GFM)
- 옵시디언 문법 지원: `![[사진.jpg]]`, `[[노트|별칭]]` — 이미지는 가까운 `attachments` 폴더에서 찾음
- `.obsidian`처럼 `.`으로 시작하는 폴더와 `attachments` 폴더는 목록에서 숨김
- 소유자 편집: 편집기 + 실시간 미리보기, Ctrl+S 저장, 새 글, 이름 바꾸기, 휴지통으로 삭제
  - 편집 중 Drive·Claude 쪽에서 같은 파일이 바뀌면 덮어쓰기 전에 알려 줌 (내용 md5 비교)
  - 입력 내용은 브라우저에 자동 임시저장 → 창을 닫아도 복원 가능
  - 사진: **사진** 버튼·붙여넣기·끌어다 놓기 → 가까운 `attachments` 폴더에 `2026-10-27 21.58.33.jpg` 형식으로 저장
    (휴대폰 사진은 브라우저에서 긴 변 2000px JPEG로 줄여서 올림. 위치 정보 등 EXIF는 빠짐)
  - 게스트는 화면·서버 양쪽에서 편집 불가

## 템플릿

새 글은 `my-life/_templates/` 폴더의 템플릿으로 시작합니다. (`_templates` 폴더는 목록에 안 보임)

1. `_templates/<최상위 폴더 이름>.md` — 예: `daily.md`는 daily 아래 어디서든 새 글을 쓸 때
2. 없으면 `_templates/default.md`
3. 그것도 없으면 앱에 내장된 기본 템플릿

`{{date}}`는 오늘 날짜(한국 시간, `YYYY-MM-DD`)로 바뀝니다.

첫 화면의 **오늘 일기 쓰기**는 `daily/<올해>` 폴더에 씁니다. 그 폴더가 없으면 저장하는 순간 만듭니다.

## 비공개 폴더 (게스트에게 숨기기)

폴더 안에 `.private`로 시작하는 파일(`.private`, `.private.md`, `.private.txt` 등, 내용은 상관없음)을 두면
그 폴더와 **모든 하위 폴더**가 게스트에게 보이지 않습니다.

- 사이드바, 폴더 목록, 최근 수정, `[[링크]]`, 이미지 주소에서 모두 빠지고, 주소를 직접 쳐도 "찾을 수 없음"
- 소유자 화면에서는 비공개가 시작되는 폴더에 🔒 표시
- 표시 파일을 지우면 2분 안에(또는 새로고침 버튼으로 바로) 다시 공개

로드맵은 [docs/ROADMAP.md](docs/ROADMAP.md) 참고.

## 구조

```
브라우저 ──(구글 로그인: 신원 확인만)──▶ Next.js 서버 ──(소유자 refresh token)──▶ Google Drive
                                          └ OWNER_EMAILS / GUEST_EMAILS 로 권한 판단
```

로그인한 사람의 Drive가 아니라, 서버가 소유자 계정 토큰으로 `my-life` 폴더만 읽습니다.
그래서 게스트를 추가해도 Drive 공유 설정을 바꿀 필요가 없습니다.

## 설정

1. GCP에서 Drive API 사용 설정, OAuth 동의 화면(외부, **프로덕션 게시**), 웹 클라이언트 생성
   - 승인된 JavaScript 원본: `http://localhost:3000`, `https://my-life-zeta-seven.vercel.app`
   - 승인된 리디렉션 URI
     - `http://localhost:3000/api/auth/callback/google`
     - `https://my-life-zeta-seven.vercel.app/api/auth/callback/google`
     - `https://developers.google.com/oauthplayground` (refresh token 발급용)
2. [OAuth Playground](https://developers.google.com/oauthplayground)에서 내 클라이언트 정보로
   `https://www.googleapis.com/auth/drive` 범위를 승인하고 `refresh_token` 발급
3. `.env.example`을 `.env.local`로 복사해서 값 채우기 (Vercel에도 같은 이름으로 등록)

`AUTH_SECRET` 생성 (Windows PowerShell):

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

> 앱이 OAuth "테스트" 상태면 refresh token이 7일마다 만료됩니다. 만료되면 화면에 안내가 뜨고, 2번만 다시 하면 됩니다.

## 로컬 실행

```bash
npm install
npm run dev     # http://localhost:3000
```

Drive 연결 없이 화면만 보고 싶으면 `.env.local`에 아래를 넣습니다. (production 빌드에서는 무시됨)

```bash
DEV_LOCAL_DRIVE_DIR=./sample-drive   # 이 폴더를 Drive 대신 읽음
DEV_FAKE_USER=bmgassi@gmail.com      # 로그인 생략
```

## 게스트 추가

Vercel 환경변수 `GUEST_EMAILS`에 쉼표로 이메일을 넣고 다시 배포하면 됩니다. 빼면 다음 요청부터 차단됩니다.
