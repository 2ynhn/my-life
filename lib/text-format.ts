// 글쓰기 도구모음의 서식 바꾸기 (편집기·내용 칸 공용, 화면 없이 글자만 다룬다)
// 입력: 글 전체와 선택 범위 → 출력: 바꿀 범위·넣을 글·바꾼 뒤 선택 범위

export type Edit = { from: number; to: number; insert: string; selFrom: number; selTo: number };

/** 선택한 글을 감싼다 (**굵게**). 선택이 없으면 자리표시 글자를 넣고 그것을 선택. 이미 감싸져 있으면 벗긴다 */
export function wrap(text: string, from: number, to: number, left: string, right: string, placeholder: string): Edit {
  const sel = text.slice(from, to);
  if (sel && text.slice(from - left.length, from) === left && text.slice(to, to + right.length) === right) {
    return { from: from - left.length, to: to + right.length, insert: sel, selFrom: from - left.length, selTo: to - left.length };
  }
  const inner = sel || placeholder;
  const start = from + left.length;
  return { from, to, insert: left + inner + right, selFrom: start, selTo: start + inner.length };
}

/** 선택한 줄마다 앞에 붙인다 (## · - · - [ ] · >). 모든 줄에 이미 있으면 뗀다. 제목은 다른 제목 표시를 바꾼다 */
export function linePrefix(text: string, from: number, to: number, prefix: string): Edit {
  const start = text.lastIndexOf("\n", from - 1) + 1;
  const nl = text.indexOf("\n", to > from && text[to - 1] === "\n" ? to - 1 : to);
  const end = nl < 0 ? text.length : nl;
  const lines = text.slice(start, end).split("\n");
  const heading = /^#{1,6} /.test(prefix);
  const has = (l: string) => l.startsWith(prefix);
  const all = lines.every((l) => !l.trim() || has(l));
  const next = lines.map((l) => {
    if (!l.trim() && lines.length > 1) return l;
    if (all) return l.slice(prefix.length);
    if (heading) return prefix + l.replace(/^#{1,6} /, "");
    // 목록·할 일·인용끼리는 바꿔 끼운다 (- 항목 → - [ ] 항목)
    return prefix + l.replace(/^(- \[[ xX]\] |- |> )/, "");
  });
  const insert = next.join("\n");
  const single = lines.length === 1;
  const caret = start + insert.length;
  return { from: start, to: end, insert, selFrom: single ? caret : start, selTo: caret };
}

/** 커서 자리에 넣는다 (구분선 등). block이면 앞뒤를 빈 줄로 띄운다 */
export function insertAt(text: string, from: number, to: number, value: string, block = false): Edit {
  let insert = value;
  if (block) {
    const before = text.slice(0, from);
    const pre = !before || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    insert = `${pre}${value}\n\n`;
  }
  const caret = from + insert.length;
  return { from, to, insert, selFrom: caret, selTo: caret };
}

/**
 * 글 링크 넣기. typed: 방금 [[ 를 쳐서 연 경우 — 이어서 이름]] 만 넣는다 (뒤에 ]] 가 이미 있으면 그 뒤로)
 * 아니면 선택한 글 자리에 [[이름]] (선택한 글이 있으면 [[이름|선택한 글]])
 */
export function insertLink(text: string, from: number, to: number, name: string, typed: boolean): Edit {
  if (typed) {
    const closed = text.slice(to, to + 2) === "]]";
    const insert = closed ? name : `${name}]]`;
    const caret = from + insert.length + (closed ? 2 : 0);
    return { from, to, insert, selFrom: caret, selTo: caret };
  }
  const label = text.slice(from, to).trim();
  const insert = label && label !== name ? `[[${name}|${label}]]` : `[[${name}]]`;
  const caret = from + insert.length;
  return { from, to, insert, selFrom: caret, selTo: caret };
}
