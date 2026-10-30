import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { DriveProblem } from "@/components/DriveProblem";
import { AiSettingsForm } from "@/components/AiSettingsForm";
import { InviteLink, RestrictList, ShareList } from "@/components/ShareManager";
import { AI_MODELS, getAiSettings } from "@/lib/ai-settings";
import { DriveError, listShares, sharingFolders, type Share } from "@/lib/drive";
import { loadLibrary, myLibrary } from "@/lib/library";
import { requireUser, type AppUser } from "@/lib/session";
import { LogoutButton } from "@/components/LogoutButton";

export const metadata: Metadata = { title: "설정" };

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <>
      <SettingsBody user={user} />
      <section className="settings account">
        <h2>계정</h2>
        <div className="account-row">
          <div>
            <strong>{user.name ?? user.email}</strong>
            <div className="muted small">{user.email}</div>
          </div>
          <LogoutButton />
        </div>
      </section>
    </>
  );
}

async function SettingsBody({ user }: { user: AppUser }) {
  const mine = await myLibrary(user);
  if (mine.kind === "problem") return <DriveProblem message={mine.problem} reauth={mine.reauth} />;
  if (mine.kind !== "ok")
    return (
      <div className="settings">
        <h1 className="page-title">설정</h1>
        <p className="muted">
          먼저 <Link href="/libraries">내 일기장</Link>을 만들거나 고르세요.
        </p>
      </div>
    );
  const loaded = await loadLibrary(user, mine.lib.rootId);
  if (loaded.kind !== "ok")
    return <DriveProblem message={loaded.kind === "problem" ? loaded.problem : "일기장을 열 수 없습니다."} />;
  const { index } = loaded;

  let shares: Share[] = [];
  let shareError: string | null = null;
  try {
    shares = await listShares(index);
  } catch (e) {
    shareError = e instanceof DriveError ? e.message : "공유 목록을 읽지 못했습니다.";
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const link = `${proto}://${host}${index.lib.base}`;

  const ai = await getAiSettings(index);

  const folders = sharingFolders(index).map((f) => ({
    id: f.id,
    path: f.slugPath.join(" / "),
    restricted: f.restricted,
    legacyPrivate: f.legacyPrivate,
  }));

  return (
    <div className="settings">
      <h1 className="page-title">설정</h1>

      <section>
        <h2>게스트 초대</h2>
        <p className="muted small">
          초대하면 Drive에서 내 <b>{index.lib.name}</b> 폴더가 그 사람에게 공유되고, Drive가 초대 메일을 보냅니다. 게스트는 자기 구글
          계정으로 로그인해 <b>자기 권한으로</b> 읽습니다. <b>보기</b>는 읽기만, <b>편집</b>은 글쓰기·수정도 됩니다. 해제하면 바로
          막힙니다. Drive 앱에서 공유를 바꿔도 똑같이 적용돼요.
        </p>
        <InviteLink link={link} />
        {shareError ? <p className="status small error">{shareError}</p> : <ShareList shares={shares} />}
      </section>

      <section>
        <h2>게스트에게 숨길 폴더</h2>
        <p className="muted small">
          Drive의 <b>접근 제한</b>을 켜면 일기장을 공유받은 사람도 그 폴더는 열 수 없습니다(Drive 웹에서도 마찬가지). 나는 계속 볼 수
          있어요. 예전 앱 규칙인 <code>.private</code> 파일은 이제 쓰지 않으니, 표시가 남은 폴더는 여기서 제한을 켠 뒤 그 파일을 지우세요.
        </p>
        {folders.length === 0 ? <p className="muted small">폴더가 없습니다.</p> : <RestrictList folders={folders} />}
      </section>

      <section>
        <h2>영수증 자동 입력 (Claude API)</h2>
        <p className="muted small">
          지출 글을 쓸 때 영수증 사진이나 주문내역 캡처를 올리면 Claude가 날짜·가게·금액·분류·품목을 채워 줍니다. 비용은{" "}
          <b>여기 입력한 내 Anthropic API 키</b>로 청구돼요(다른 사람은 각자 자기 키를 씁니다). 키는 내 Drive의{" "}
          <code>{index.lib.name}/_settings/ai.json</code>에 암호화되어 저장되고, 이 앱 서버에는 남지 않습니다. 키는{" "}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">
            Anthropic 콘솔
          </a>
          에서 만들 수 있어요.
        </p>
        <AiSettingsForm models={AI_MODELS} model={ai.model} hasKey={ai.hasKey} keyHint={ai.keyHint} />
      </section>

      <section>
        <h2>내 일기장</h2>
        <p className="muted small">
          내 Drive의 <b>{index.lib.name}</b> 폴더를 쓰고 있어요.{" "}
          <Link href="/libraries">일기장 목록</Link>에서 공유받은 일기장을 열거나 내 일기장 폴더를 바꿀 수 있어요.
        </p>
      </section>
    </div>
  );
}
