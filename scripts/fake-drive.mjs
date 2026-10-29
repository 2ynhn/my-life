#!/usr/bin/env node
// 개발·테스트용 가짜 Google Drive 서버.
// 앱이 쓰는 Drive API만 흉내 내고, 권한 규칙(소유자·편집자·보기, 상위 폴더 상속, 접근 제한 폴더)을 따른다.
// 실제 구글 로그인 없이 여러 사람의 Drive와 공유를 시험할 수 있다.
//
//   node scripts/fake-drive.mjs --port 4010 --lib me@example.com=./sample-drive [--lib mom@example.com=./mom-drive]
//
// 앱 쪽 .env.local:
//   DEV_GOOGLE_API_BASE=http://localhost:4010
//   DEV_FAKE_USER=me@example.com     (dev-user 쿠키로 사람을 바꿀 수 있음)
//
// 토큰: refresh/access token은 "dev:<이메일>" 형식. /__revoke?email=… 로 그 사람의 토큰을 취소할 수 있다.

import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const FOLDER = "application/vnd.google-apps.folder";
const MIME = { ".md": "text/markdown", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".txt": "text/plain", ".json": "application/json" };

const args = process.argv.slice(2);
const opt = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const PORT = Number(opt("--port")[0] ?? 4010);
// 속도 시험용: 요청마다 지연(ms)을 주고, 요청 기록을 /__log 로 보여 준다
const LATENCY = Number(opt("--latency")[0] ?? 0);
const requestLog = [];

/** @type {Map<string, any>} */
const files = new Map();
const revoked = new Set();
/** 변경 기록: Drive changes API 흉내 (페이지 토큰 = 순번) */
const changeLog = [];
const touch = (id) => changeLog.push(id);
/** 테스트용: 폴더 목록 조회 횟수 (/__stats) */
const stats = { listChildren: 0, changes: 0 };
let lastAi = null;
const now = () => new Date().toISOString();
const newId = () => "f" + randomUUID().replace(/-/g, "").slice(0, 20);
const rootOf = (email) => `root:${email}`;

function add(file) {
  files.set(file.id, { trashed: false, restricted: false, perms: [], content: null, modifiedTime: now(), ...file });
  touch(file.id);
  return files.get(file.id);
}

function load(dir, parentId, owner) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      const f = add({ id: newId(), name, mimeType: FOLDER, parents: [parentId], owner });
      load(p, f.id, owner);
    } else {
      add({ id: newId(), name, mimeType: MIME[path.extname(name).toLowerCase()] ?? "application/octet-stream", parents: [parentId], owner, content: readFileSync(p) });
    }
  }
}

for (const spec of opt("--lib")) {
  const [owner, dir] = spec.split("=");
  const lib = add({ id: newId(), name: "my-life", mimeType: FOLDER, parents: [rootOf(owner)], owner });
  load(path.resolve(dir), lib.id, owner);
  console.log(`[fake-drive] ${owner} → my-life ${lib.id}`);
}

// ───────────── 권한 ─────────────

const RANK = { meta: 0, reader: 1, commenter: 1, writer: 2, owner: 3 };

/** 이 사람이 이 파일에 대해 가진 권한: owner | writer | reader | meta(보이기만, 열 수 없음) | null */
function access(file, email) {
  if (!file || file.trashed) return null;
  if (file.owner === email) return "owner";
  const direct = file.perms.find((p) => p.emailAddress === email)?.role;
  const parentId = file.parents?.[0];
  const parent = parentId && !parentId.startsWith("root:") ? files.get(parentId) : null;
  let inherited = parent ? access(parent, email) : null;
  if (inherited === "meta") inherited = null;
  if (inherited === "owner") inherited = "writer";
  if (file.restricted) {
    // 접근 제한: 상위에서 물려받은 권한으로는 이름만 보이고 열 수 없다
    return direct ?? (inherited ? "meta" : null);
  }
  if (!direct) return inherited;
  if (!inherited) return direct;
  return RANK[direct] >= RANK[inherited] ? direct : inherited;
}

const can = (file, email) => {
  const a = access(file, email);
  const write = a === "owner" || a === "writer";
  return {
    canEdit: write,
    canAddChildren: write && file.mimeType === FOLDER,
    canListChildren: file.mimeType === FOLDER && a !== "meta" && a !== null,
    canRename: write,
    canTrash: a === "owner",
    canShare: write,
    canDisableInheritedPermissions: a === "owner",
  };
};

const md5 = (buf) => createHash("md5").update(buf ?? Buffer.alloc(0)).digest("hex");

function meta(file, email) {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime,
    trashed: file.trashed,
    parents: file.parents,
    size: file.content ? String(file.content.length) : undefined,
    md5Checksum: file.content ? md5(file.content) : undefined,
    ownedByMe: file.owner === email,
    owners: [{ emailAddress: file.owner, displayName: file.owner.split("@")[0] }],
    inheritedPermissionsDisabled: file.restricted,
    appProperties: file.appProperties,
    capabilities: can(file, email),
  };
}

// ───────────── HTTP ─────────────

const send = (res, status, body, headers = {}) => {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, { "Content-Type": isBuf ? headers["Content-Type"] ?? "application/octet-stream" : "application/json", ...headers });
  res.end(isBuf ? body : JSON.stringify(body));
};
const fail = (res, status, reason, message = reason) => send(res, status, { error: { code: status, message, errors: [{ reason }] } });

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });

function parseMultipart(buf, contentType) {
  const boundary = /boundary=([^;]+)/.exec(contentType)?.[1];
  const sep = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buf.indexOf(sep) + sep.length;
  for (;;) {
    const next = buf.indexOf(sep, start);
    if (next < 0) break;
    const part = buf.subarray(start, next);
    const headEnd = part.indexOf("\r\n\r\n");
    let body = part.subarray(headEnd + 4);
    if (body.subarray(-2).toString() === "\r\n") body = body.subarray(0, -2);
    parts.push(body);
    start = next + sep.length;
  }
  return { meta: JSON.parse(parts[0].toString()), content: parts[1] };
}

/** 앱이 쓰는 q 문법만: 'X' in parents, trashed = false, name = '…', mimeType = '…', 'me' in owners, sharedWithMe = true */
function query(q, email) {
  const clauses = q.split(/\s+and\s+/).map((c) => c.trim());
  let result = [...files.values()].filter((f) => access(f, email) !== null);
  for (const c of clauses) {
    let m;
    if ((m = /^'(.+)' in parents$/.exec(c))) {
      const pid = m[1] === "root" ? rootOf(email) : m[1].replace(/\\'/g, "'");
      if (!pid.startsWith("root:")) {
        const parent = files.get(pid);
        const a = access(parent, email);
        if (!a || a === "meta") return [];
      } else if (pid !== rootOf(email)) return [];
      result = result.filter((f) => f.parents?.includes(pid));
    } else if (c === "trashed = false") result = result.filter((f) => !f.trashed);
    else if ((m = /^name = '(.+)'$/.exec(c))) result = result.filter((f) => f.name === m[1]);
    else if ((m = /^mimeType = '(.+)'$/.exec(c))) result = result.filter((f) => f.mimeType === m[1]);
    else if ((m = /^mimeType != '(.+)'$/.exec(c))) result = result.filter((f) => f.mimeType !== m[1]);
    else if ((m = /^fullText contains '(.+)'$/.exec(c))) {
      // Drive처럼 '단어 전체'가 맞아야 찾는다 (단어 일부·조사 붙은 말은 못 찾음)
      const term = m[1].replace(/\\'/g, "'").toLowerCase();
      const words = (f) => `${f.name} ${f.content && a(f) ? f.content.toString() : ""}`.toLowerCase().split(/[\s\p{P}\p{S}]+/u);
      const a = (f) => { const r = access(f, email); return r && r !== "meta"; };
      result = result.filter((f) => words(f).includes(term));
    }
    else if (c === "'me' in owners") result = result.filter((f) => f.owner === email);
    else if (c === "sharedWithMe = true") result = result.filter((f) => f.owner !== email && f.perms.some((p) => p.emailAddress === email));
    else throw new Error(`지원하지 않는 검색: ${c}`);
  }
  return result;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const body = await readBody(req);
  if (url.pathname === "/__log") {
    const out = requestLog.splice(0);
    return send(res, 200, out);
  }
  if (!url.pathname.startsWith("/__")) {
    requestLog.push(`${req.method} ${url.pathname}${url.searchParams.get("q") ? " q=" + url.searchParams.get("q").slice(0, 40) : ""}${url.searchParams.get("alt") ? " alt=" + url.searchParams.get("alt") : ""}`);
    if (LATENCY) await new Promise((r) => setTimeout(r, LATENCY));
  }
  try {
    if (url.pathname === "/__revoke") {
      revoked.add(url.searchParams.get("email"));
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/__stats") return send(res, 200, stats);
    // ── 가짜 Anthropic API (영수증 읽기 시험용). 키 "sk-ant-dev-ok…"만 통과
    if (url.pathname.startsWith("/v1/")) {
      // SDK 버전에 따라 x-api-key 또는 Authorization: Bearer 로 온다
      const key = req.headers["x-api-key"] ?? String(req.headers.authorization ?? "").replace(/^Bearer /, "");
      if (!String(key).startsWith("sk-ant-dev-ok"))
        return send(res, 401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
      const model = /^\/v1\/models\/([^/]+)$/.exec(url.pathname);
      if (req.method === "GET" && model) return send(res, 200, { id: model[1], type: "model", display_name: model[1] });
      if (req.method === "POST" && url.pathname === "/v1/messages") {
        const params = JSON.parse(body.toString());
        lastAi = { headers: { "anthropic-beta": req.headers["anthropic-beta"] ?? null }, params: { ...params, messages: params.messages.map((m2) => ({ ...m2, content: m2.content.map((c) => (c.type === "image" ? { ...c, source: { ...c.source, data: `<${c.source.data.length} chars>` } } : c)) })) } };
        const props = params.output_config?.format?.schema?.properties ?? {};
        const lastText = params.messages.at(-1).content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
        let out;
        if (props.keywords) {
          // 물어보기 1단계: 질문의 낱말을 검색어로 (조사 떼기)
          const q = /질문:\s*(.*)/.exec(lastText)?.[1] ?? lastText;
          const keywords = q.replace(/[?？.!]/g, " ").split(/\s+/).map((w) => w.replace(/(에서|으로|에게|은|는|이|가|을|를|의|에|랑|과|와|도)$/, "")).filter((w) => w.length >= 2 && !/^(어디|언제|무엇|뭐|얼마|했지|갔지|먹은|먹었지|샀지|곳|있었지)/.test(w));
          out = { keywords, from: "", to: "", kinds: [] };
        } else if (props.answer) {
          // 물어보기 2단계: 첫 번째 자료를 근거로 답한 척
          const first = /\[(\d+)\] ([^\n]+)/.exec(lastText);
          out = first ? { answer: `찾은 기록에 따르면 ${first[2]} 에 적혀 있어요 [${first[1]}].`, sources: [Number(first[1])] } : { answer: "관련 기록을 찾지 못했어요.", sources: [] };
        } else {
          out = { date: "2026-10-27", store: "이마트 성수점", amount: 58400, category: "식비", payment: "신한카드", items: [{ name: "우유", price: 2980 }, { name: "계란 30구", price: 8900 }] };
        }
        return send(res, 200, { id: "msg_fake", type: "message", role: "assistant", model: params.model, content: [{ type: "text", text: JSON.stringify(out) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1500, output_tokens: 120 } });
      }
    }
    if (url.pathname === "/__last-ai") return send(res, 200, lastAi);
    if (url.pathname === "/token") {
      const rt = new URLSearchParams(body.toString()).get("refresh_token") ?? "";
      if (!rt.startsWith("dev:") || revoked.has(rt.slice(4))) return send(res, 400, { error: "invalid_grant" });
      return send(res, 200, { access_token: rt, expires_in: 3600, scope: "https://www.googleapis.com/auth/drive" });
    }

    const auth = req.headers.authorization ?? "";
    const email = auth.startsWith("Bearer dev:") ? auth.slice("Bearer dev:".length) : null;
    if (!email || revoked.has(email)) return fail(res, 401, "authError");

    let m;
    // 변경 목록
    if (req.method === "GET" && url.pathname === "/drive/v3/changes/startPageToken") {
      return send(res, 200, { startPageToken: String(changeLog.length) });
    }
    if (req.method === "GET" && url.pathname === "/drive/v3/changes") {
      stats.changes++;
      const from = Number(url.searchParams.get("pageToken") ?? 0);
      const ids = [...new Set(changeLog.slice(from))];
      return send(res, 200, {
        newStartPageToken: String(changeLog.length),
        changes: ids.map((id) => {
          const f = files.get(id);
          const a = access(f, email);
          return a ? { fileId: id, removed: false, file: meta(f, email) } : { fileId: id, removed: true };
        }),
      });
    }
    // 목록
    if (req.method === "GET" && url.pathname === "/drive/v3/files") {
      if (/ in parents/.test(url.searchParams.get("q") ?? "")) stats.listChildren++;
      return send(res, 200, { files: query(url.searchParams.get("q") ?? "", email).map((f) => meta(f, email)) });
    }
    // 폴더 만들기
    if (req.method === "POST" && url.pathname === "/drive/v3/files") {
      const { name, mimeType, parents } = JSON.parse(body.toString());
      const pid = parents?.[0] ?? rootOf(email);
      if (!pid.startsWith("root:") && !can(files.get(pid), email).canAddChildren) return fail(res, 403, "insufficientFilePermissions");
      if (pid.startsWith("root:") && pid !== rootOf(email)) return fail(res, 403, "insufficientFilePermissions");
      const f = add({ id: newId(), name, mimeType, parents: [pid], owner: email });
      return send(res, 200, { id: f.id });
    }
    // 업로드로 새 파일
    if (req.method === "POST" && url.pathname === "/upload/drive/v3/files") {
      const { meta: m2, content } = parseMultipart(body, req.headers["content-type"]);
      const pid = m2.parents[0];
      if (!can(files.get(pid), email).canAddChildren) return fail(res, 403, "insufficientFilePermissions");
      const f = add({ id: newId(), name: m2.name, mimeType: m2.mimeType, parents: [pid], owner: email, content });
      if (m2.appProperties) f.appProperties = m2.appProperties;
      return send(res, 200, { id: f.id });
    }
    // 내용 바꾸기
    if (req.method === "PATCH" && (m = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname))) {
      const f = files.get(decodeURIComponent(m[1]));
      if (!access(f, email)) return fail(res, 404, "notFound");
      if (!can(f, email).canEdit) return fail(res, 403, "insufficientFilePermissions");
      f.content = body;
      f.modifiedTime = now();
      touch(f.id);
      return send(res, 200, { md5Checksum: md5(body) });
    }
    // 공유 목록·추가
    if ((m = /^\/drive\/v3\/files\/([^/]+)\/permissions$/.exec(url.pathname))) {
      const f = files.get(decodeURIComponent(m[1]));
      if (!access(f, email)) return fail(res, 404, "notFound");
      if (!can(f, email).canShare) return fail(res, 403, "insufficientFilePermissions");
      if (req.method === "GET") {
        return send(res, 200, {
          permissions: [{ id: "owner", type: "user", role: "owner", emailAddress: f.owner }, ...f.perms.map((p) => ({ ...p, type: "user" }))],
        });
      }
      if (req.method === "POST") {
        const { role, emailAddress } = JSON.parse(body.toString());
        const existing = f.perms.find((p) => p.emailAddress === emailAddress);
        if (existing) existing.role = role;
        else f.perms.push({ id: "p" + randomUUID().slice(0, 8), role, emailAddress });
        touch(f.id);
        console.log(`[fake-drive] ${email} shared ${f.name} with ${emailAddress} (${role}) notify=${url.searchParams.get("sendNotificationEmail")}`);
        return send(res, 200, { id: f.perms.find((p) => p.emailAddress === emailAddress).id });
      }
    }
    if (req.method === "DELETE" && (m = /^\/drive\/v3\/files\/([^/]+)\/permissions\/([^/]+)$/.exec(url.pathname))) {
      const f = files.get(decodeURIComponent(m[1]));
      if (!access(f, email)) return fail(res, 404, "notFound");
      if (!can(f, email).canShare) return fail(res, 403, "insufficientFilePermissions");
      f.perms = f.perms.filter((p) => p.id !== decodeURIComponent(m[2]));
      touch(f.id);
      return send(res, 204, {});
    }
    // 파일 하나: 정보·내용·수정
    if ((m = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname))) {
      const f = files.get(decodeURIComponent(m[1]));
      const a = access(f, email);
      if (!a) return fail(res, 404, "notFound", "File not found");
      if (req.method === "GET") {
        if (url.searchParams.get("alt") === "media") {
          if (a === "meta" || f.mimeType === FOLDER) return fail(res, 403, "insufficientFilePermissions");
          return send(res, 200, f.content ?? Buffer.alloc(0), { "Content-Type": f.mimeType });
        }
        return send(res, 200, meta(f, email));
      }
      if (req.method === "PATCH") {
        const patch = JSON.parse(body.toString());
        const c = can(f, email);
        if ("name" in patch) {
          if (!c.canRename) return fail(res, 403, "insufficientFilePermissions");
          f.name = patch.name;
        }
        if ("trashed" in patch) {
          if (!c.canTrash) return fail(res, 403, "insufficientFilePermissions");
          f.trashed = !!patch.trashed;
        }
        if ("inheritedPermissionsDisabled" in patch) {
          if (!c.canDisableInheritedPermissions) return fail(res, 403, "insufficientFilePermissions");
          f.restricted = !!patch.inheritedPermissionsDisabled;
        }
        f.modifiedTime = now();
        touch(f.id);
        return send(res, 200, { id: f.id });
      }
    }
    fail(res, 404, "notFound", `fake-drive: ${req.method} ${url.pathname}`);
  } catch (e) {
    console.error("[fake-drive]", e);
    fail(res, 400, "badRequest", String(e));
  }
});

server.listen(PORT, () => console.log(`[fake-drive] http://localhost:${PORT}`));
