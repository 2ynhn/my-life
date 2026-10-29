import { createNote, saveNote } from "@/app/(app)/note-actions";

// 뒤에서 저장하기 (lib/save-queue.ts). 서버 액션은 한 번에 하나씩만 보내지고 화면 이동까지 붙잡아서,
// 저장을 기다리지 않고 바로 다음 화면으로 넘어가도록 일반 요청으로 받는다. 하는 일은 서버 액션과 같다.

type Body =
  | { op: "save"; rootId: string; fileId: string; checksum: string; text: string; force?: boolean }
  | { op: "create"; rootId: string; folderId: string; name: string; text: string; subfolder?: string; autoName?: boolean };

export async function POST(req: Request) {
  // 다른 사이트에서 보낸 요청은 받지 않는다
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 403 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const result =
    body.op === "save"
      ? await saveNote(str(body.rootId), str(body.fileId), str(body.checksum), str(body.text), body.force === true, true)
      : body.op === "create"
        ? await createNote(
            str(body.rootId),
            str(body.folderId),
            str(body.name),
            str(body.text),
            typeof body.subfolder === "string" ? body.subfolder : undefined,
            body.autoName === true,
          )
        : { ok: false as const, error: "잘못된 요청입니다." };
  return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
