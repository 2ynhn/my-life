import { parse as parseYaml } from "yaml";
import { findAttachment, findNoteByName, hrefFor, type DriveIndex, type FolderEntry } from "@/lib/drive";

export type NoteMeta = Record<string, unknown>;

/** 맨 앞의 --- YAML --- 블록을 떼어 낸다. 형식이 깨졌으면 본문 그대로 둔다 */
export function splitFrontmatter(text: string): { meta: NoteMeta; body: string } {
  const src = text.replace(/^﻿/, "");
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) return { meta: {}, body: src };
  try {
    const meta = parseYaml(m[1]);
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
      return { meta: meta as NoteMeta, body: src.slice(m[0].length) };
    }
  } catch {
    // 잘못된 YAML은 본문으로 보여 준다
  }
  return { meta: {}, body: src };
}

const escapeLabel = (s: string) => s.replace(/([\[\]\\])/g, "\\$1");
const fileUrl = (id: string) => `/api/file/${encodeURIComponent(id)}`;

/**
 * 옵시디언 문법을 일반 마크다운으로 바꾼다 (코드 블록 안은 건드리지 않음)
 *  ![[사진.jpg]] / ![[사진.jpg|300]] → 이미지
 *  [[노트]] / [[노트|별칭]]          → 내부 링크
 *  ![설명](사진.jpg)                 → 첨부 폴더에서 찾아 이미지
 */
export function rewriteObsidian(body: string, folder: FolderEntry, index: DriveIndex): string {
  const parts = body.split(/(^```[\s\S]*?^```)/m);
  return parts.map((part, i) => (i % 2 === 1 ? part : rewritePart(part, folder, index))).join("");
}

function rewritePart(text: string, folder: FolderEntry, index: DriveIndex): string {
  return text
    .replace(/(!?)\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_all, bang: string, rawTarget: string, alias?: string) => {
      const target = rawTarget.trim().split("#")[0];
      if (bang) {
        const file = findAttachment(folder, target);
        if (file && !file.isMarkdown) return `![${escapeLabel(target)}](${fileUrl(file.id)})`;
      }
      const label = escapeLabel((bang ? undefined : alias?.trim()) || target);
      const note = findNoteByName(index, target);
      if (note) return `[${label}](${hrefFor(note)})`;
      return bang ? `*〔첨부 없음: ${escapeLabel(target)}〕*` : label;
    })
    .replace(/!\[([^\]]*)\]\(<?([^)>\s]+)>?\)/g, (all, alt: string, src: string) => {
      if (/^(https?:|data:|\/)/i.test(src)) return all;
      let name = src;
      try {
        name = decodeURIComponent(src);
      } catch {}
      const file = findAttachment(folder, name.split("/").pop() ?? name);
      return file ? `![${alt}](${fileUrl(file.id)})` : all;
    });
}

/** frontmatter 값을 화면용 문자열로 */
export function formatMetaValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(formatMetaValue).join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "");
}

export function metaTags(meta: NoteMeta): string[] {
  const tags = meta.tags;
  if (Array.isArray(tags)) return tags.map(String);
  if (typeof tags === "string") return tags.split(/[,\s]+/).filter(Boolean);
  return [];
}
