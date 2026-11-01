import { createNote, saveNote } from "@/app/(app)/note-actions";

// 뒤에서 저장하기 (lib/save-queue.ts). 서버 액션은 한 번에 하나씩만 보내지고 화면 이동까지 붙잡아서,
// 저장을 기다리지 않고 바로 다음 화면으로 넘어가도록 일반 요청으로 받는다. 하는 일은 서버 액션과 같다.
// 쌓인 저장은 { jobs: [...] }로 묶어 한 번에 받아 차례로 처리한다 (요청 하나에 최대 MAX_JOBS개).

type Body =
  | { op: "save"; rootId: string; fileId: string; checksum: string; text: string; force?: boolean }
  | { op: "create"; rootId: string; folderId: string; name: string; text: string; subfolder?: string; autoName?: boolean };

const MAX_JOBS = 10;
const str = (v: unknown) => (typeof v === "string" ? v : "");

function run(body: Body) {
  return body.op === "save"
    ? saveNote(str(body.rootId), str(body.fileId), str(body.checksum), str(body.text), body.force === true, true)
    : body.op === "create"
      ? createNote(
          str(body.rootId),
          str(body.folderId),
          str(body.name),
          str(body.text),
          typeof body.subfolder === "string" ? body.subfolder : undefined,
          body.autoName === true,
        )
      : Promise.resolve({ ok: false as const, error: "잘못된 요청입니다." });
}

export async function POST(req: Request) {
  // 다른 사이트에서 보낸 요청은 받지 않는다
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 403 });

  let body: Body | { jobs?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  const headers = { "Cache-Control": "private, no-store" };
  if ("jobs" in body) {
    if (!Array.isArray(body.jobs) || body.jobs.length > MAX_JOBS) return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
    // 차례로 (같은 일기장 목록 캐시를 차례로 고치게)
    const results = [];
    for (const job of body.jobs as Body[]) results.push(await run(job));
    return Response.json({ results }, { headers });
  }
  return Response.json(await run(body as Body), { headers });
}
