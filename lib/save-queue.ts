// 뒤에서 저장하기 (브라우저용): 저장을 누르면 여기에 넣고 바로 다음 화면으로 넘어간다.
// 하나씩 차례로 /api/notes 로 보내고, 끝날 때까지 브라우저 저장소에 남겨 두어 창을 닫거나 인터넷이 끊겨도 다시 보낸다.
// 실패하면 내용을 임시본으로 돌려놓아, 그 글을 다시 열면 '복원'할 수 있다.

export type Draft = { text: string; name?: string; at: number };

export type Job = {
  id: string;
  at: number;
  op: "save" | "create";
  rootId: string;
  text: string;
  /** 알림에 보일 이름 */
  label: string;
  /** 실패하면 내용을 돌려놓을 임시본 자리 */
  draftKey: string;
  /** 실패했을 때 다시 열 주소 */
  reopenHref: string;
  // save
  fileId?: string;
  checksum?: string;
  /** 같은 글의 앞선 저장이 끝난 뒤의 checksum을 써야 함 */
  chain?: boolean;
  force?: boolean;
  // create
  folderId?: string;
  name?: string;
  subfolder?: string;
  autoName?: boolean;
  state: "waiting" | "sending" | "failed";
  error?: string;
};

export type JobResult =
  | { ok: true; checksum?: string; href?: string }
  | { ok: false; error: string; conflict?: { text: string; checksum: string } };

const KEY = "my-life:save-queue";

// 브라우저 저장소는 사생활 보호 모드 등에서 막힐 수 있으므로 항상 try/catch
export function readDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
export function writeDraft(key: string, draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  } catch {}
}

let jobs: Job[] | null = null;
const listeners = new Set<() => void>();
const resultListeners = new Set<(job: Job, result: JobResult) => void>();

function load(): Job[] {
  if (jobs) return jobs;
  try {
    const raw = localStorage.getItem(KEY);
    // 보내던 중에 창이 닫혔으면 다시 보낸다
    jobs = raw ? (JSON.parse(raw) as Job[]).map((j) => (j.state === "sending" ? { ...j, state: "waiting" } : j)) : [];
  } catch {
    jobs = [];
  }
  return jobs;
}

function commit(next: Job[]) {
  jobs = next;
  try {
    if (next.length) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {}
  for (const l of listeners) l();
}

const patch = (id: string, fields: Partial<Job>) => commit(load().map((j) => (j.id === id ? { ...j, ...fields } : j)));

export const getJobs = (): Job[] => load();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 저장이 끝날 때마다 (편집기가 checksum·충돌을 받는다) */
export function onResult(listener: (job: Job, result: JobResult) => void): () => void {
  resultListeners.add(listener);
  return () => resultListeners.delete(listener);
}

/** 이 글의 아직 안 끝난 저장 (편집기를 다시 열 때 그 내용으로 시작) */
export const pendingSave = (fileId: string): Job | undefined =>
  load()
    .filter((j) => j.op === "save" && j.fileId === fileId && j.state !== "failed")
    .at(-1);

type NewJob = Omit<Job, "id" | "at" | "state" | "chain" | "error">;

export function enqueue(input: NewJob) {
  const list = load();
  writeDraft(input.draftKey, null);
  if (input.op === "save") {
    const same = list.filter((j) => j.op === "save" && j.fileId === input.fileId);
    const waiting = same.find((j) => j.state === "waiting");
    if (waiting) {
      // 아직 안 보낸 저장이 있으면 내용만 새것으로
      patch(waiting.id, { text: input.text, force: waiting.force || input.force, at: Date.now() });
      return void kick();
    }
    const sending = same.some((j) => j.state === "sending");
    const rest = list.filter((j) => !(j.op === "save" && j.fileId === input.fileId && j.state === "failed"));
    commit([...rest, { ...input, id: crypto.randomUUID(), at: Date.now(), state: "waiting", chain: sending }]);
  } else {
    commit([...list, { ...input, id: crypto.randomUUID(), at: Date.now(), state: "waiting" }]);
  }
  void kick();
}

/** 실패한 것을 다시 보내기 */
export function retry(id: string) {
  const job = load().find((j) => j.id === id);
  if (!job) return;
  writeDraft(job.draftKey, null);
  patch(id, { state: "waiting", error: undefined });
  void kick();
}

/** 실패한 것을 그만두기 (내용은 임시본에 남아 있음) */
export function dismiss(id: string) {
  commit(load().filter((j) => j.id !== id));
}

let running = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

export async function kick() {
  if (running || typeof window === "undefined") return;
  running = true;
  clearTimeout(retryTimer);
  try {
    for (;;) {
      const job = load().find((j) => j.state === "waiting");
      if (!job) break;
      patch(job.id, { state: "sending" });
      let result: JobResult;
      try {
        result = await send(job);
      } catch {
        // 인터넷이 끊겼거나 서버가 잠깐 안 됨: 그대로 두고 조금 뒤에 다시
        patch(job.id, { state: "waiting" });
        retryTimer = setTimeout(() => void kick(), 15_000);
        break;
      }
      finish(job, result);
    }
  } finally {
    running = false;
  }
}

async function send(job: Job): Promise<JobResult> {
  const body =
    job.op === "save"
      ? { op: "save", rootId: job.rootId, fileId: job.fileId, checksum: job.checksum, text: job.text, force: job.force }
      : {
          op: "create",
          rootId: job.rootId,
          folderId: job.folderId,
          name: job.name,
          text: job.text,
          subfolder: job.subfolder,
          autoName: job.autoName,
        };
  const res = await fetch("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status >= 500 || !res.headers.get("content-type")?.includes("json")) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as JobResult;
}

function finish(job: Job, result: JobResult) {
  const rest = load().filter((j) => j.id !== job.id);
  if (result.ok) {
    // 같은 글의 다음 저장은 방금 받은 checksum 기준으로
    commit(
      rest.map((j) =>
        j.chain && j.op === "save" && j.fileId === job.fileId ? { ...j, chain: false, checksum: result.checksum } : j,
      ),
    );
  } else {
    // 같은 글의 다음 저장이 기다리고 있으면 그 (더 새) 내용으로 합쳐 하나만 실패로 남긴다
    const next = rest.find((j) => j.chain && j.op === "save" && j.fileId === job.fileId);
    const failed: Job = { ...job, text: next?.text ?? job.text, state: "failed", error: result.error };
    // 내용은 임시본으로 돌려놓아, 그 글을 다시 열면 복원할 수 있다
    writeDraft(job.draftKey, { text: failed.text, name: job.name, at: Date.now() });
    commit([...rest.filter((j) => j !== next), failed]);
  }
  for (const l of resultListeners) l(job, result);
}
