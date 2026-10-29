"use client";

import { MapPin, MapPinPlus, Plus, Star, X } from "lucide-react";
import { useState } from "react";
import { numberish, readMeta, setFields, type FieldValue } from "@/lib/frontmatter-edit";
import { METRIC_GROUPS, METRICS, HEALTH_TEXT_KEYS } from "@/lib/health-metrics";
import { CATEGORIES } from "@/lib/receipt-shape";

// 카테고리별 입력 폼. 값은 편집기 글의 앞머리(YAML)에 바로 쓰고, 편집기에서 고친 것도 바로 여기 보인다.

export type FormKind = "diary" | "spending" | "travel" | "health" | "food";
export type Suggestions = {
  tags: string[];
  people: string[];
  stores: string[];
  payments: string[];
  categories?: string[];
  restaurants?: string[];
  menus?: string[];
};

type Props = {
  kind: FormKind;
  text: string;
  onChange: (next: string) => void;
  suggestions: Suggestions | null;
  onAddPlace?: () => void;
  /** 분류를 목록에 더한다 (권한이 있을 때만). 실패하면 오류 문구 */
  onAddCategory?: (name: string) => Promise<string | null>;
};

const str = (v: unknown) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => str(x).trim()).filter(Boolean) : typeof v === "string" && v.trim() ? v.split(/[,\s]+/).filter(Boolean) : [];
const won = (n: unknown) => (typeof n === "number" ? `${n.toLocaleString("ko-KR")}원` : "");

/** 태그·사람: 엔터·쉼표로 넣고 ✕로 뺀다. 자주 쓴 것은 눌러서 바로 */
export function Chips({
  values,
  onChange,
  suggestions = [],
  placeholder,
  label,
  hash = false,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder: string;
  label: string;
  hash?: boolean;
}) {
  const [input, setInput] = useState("");
  const add = (raw: string) => {
    const vs = raw
      .split(/[,，]/)
      .map((v) => v.trim().replace(/^#/, ""))
      .filter((v) => v && !values.includes(v));
    if (vs.length) onChange([...values, ...vs]);
    setInput("");
  };
  const q = input.trim().replace(/^#/, "").toLowerCase();
  const quick = suggestions.filter((s) => !values.includes(s) && (!q || s.toLowerCase().includes(q))).slice(0, 8);
  return (
    <div className="chips-field">
      <span className="form-label">{label}</span>
      <div className="chips">
        {values.map((v) => (
          <span key={v} className="chip">
            {hash && "#"}
            {v}
            <button type="button" aria-label={`${v} 빼기`} onClick={() => onChange(values.filter((x) => x !== v))}>
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => (/[,，]$/.test(e.target.value) ? add(e.target.value) : setInput(e.target.value))}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return; // 한글 조합 중 엔터는 무시
            if (e.key === "Enter") {
              e.preventDefault();
              add(input);
            } else if (e.key === "Backspace" && !input && values.length) onChange(values.slice(0, -1));
          }}
          onBlur={() => input.trim() && add(input)}
          placeholder={values.length ? "" : placeholder}
          aria-label={label}
          enterKeyHint="done"
        />
      </div>
      {quick.length > 0 && (
        <div className="chip-suggest">
          {quick.map((s) => (
            <button type="button" key={s} onClick={() => add(s)}>
              <Plus size={12} aria-hidden />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
  type = "text",
  list: listId,
  placeholder,
  hint,
  numeric = false,
}: {
  label: string;
  value: unknown;
  onChange: (v: string) => void;
  type?: "text" | "date";
  list?: string;
  placeholder?: string;
  hint?: string;
  numeric?: boolean;
}) {
  return (
    <label className="form-field">
      <span className="form-label">{label}</span>
      <input
        type={type}
        value={str(value)}
        onChange={(e) => onChange(e.target.value)}
        list={listId}
        placeholder={placeholder}
        inputMode={numeric ? "decimal" : undefined}
        enterKeyHint="next"
      />
      {hint && <span className="form-hint">{hint}</span>}
    </label>
  );
}

/** 분류 버튼 줄 끝의 '+ 분류 추가': 눌러서 이름을 쓰면 목록(분류 관리)에 저장하고 바로 고른다 */
function AddCategory({ onAdd, onAdded }: { onAdd: (name: string) => Promise<string | null>; onAdded: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    const n = name.replace(/\s+/g, " ").trim();
    if (!n || busy) return;
    setBusy(true);
    setError(null);
    const err = await onAdd(n);
    setBusy(false);
    if (err) return setError(err);
    onAdded(n);
    setName("");
    setOpen(false);
  };
  if (!open)
    return (
      <button type="button" className="seg-add" onClick={() => setOpen(true)}>
        <Plus size={14} aria-hidden /> 분류 추가
      </button>
    );
  return (
    <span className="seg-add-form">
      <input
        value={name}
        autoFocus
        maxLength={30}
        placeholder="예: 사무용품"
        aria-label="새 분류 이름"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      <button type="button" className="btn btn-save" disabled={busy || !name.trim()} onClick={() => void submit()}>
        {busy ? "저장 중…" : "추가"}
      </button>
      <button type="button" className="icon-btn" aria-label="취소" onClick={() => setOpen(false)}>
        <X size={14} aria-hidden />
      </button>
      {error && <span className="status small error">{error}</span>}
    </span>
  );
}

export function MetaForm({ kind, text, onChange, suggestions, onAddPlace, onAddCategory }: Props) {
  const meta = readMeta(text);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [newKey, setNewKey] = useState("");
  if (!meta) return <p className="status small error">앞머리(--- 사이) 형식이 깨져 폼을 쓸 수 없어요. '쓰기'에서 고쳐 주세요.</p>;

  const set = (fields: Record<string, FieldValue | undefined>) => {
    try {
      onChange(setFields(text, fields));
    } catch {}
  };
  const s = suggestions ?? { tags: [], people: [], stores: [], payments: [] };
  const tags = (
    <Chips label="키워드" hash values={list(meta.tags)} onChange={(v) => set({ tags: v })} suggestions={s.tags} placeholder="예: 산책, 맛집 (엔터로 추가)" />
  );

  if (kind === "diary")
    return (
      <div className="meta-form compact">
        {tags}
        <Chips
          label="함께한 사람"
          values={list(meta.people)}
          onChange={(v) => set({ people: v })}
          suggestions={s.people}
          placeholder="예: 엄마, 동생"
        />
      </div>
    );

  if (kind === "spending") {
    const cats: string[] = s.categories ?? [...CATEGORIES];
    const items = Array.isArray(meta.items)
      ? (meta.items as Record<string, unknown>[]).map((it) => ({ name: str(it?.name), price: it?.price ?? null }))
      : [];
    const setItems = (next: { name: string; price: unknown }[]) =>
      set({ items: next.map((it) => ({ name: it.name, price: typeof it.price === "number" ? it.price : 0 })) });
    return (
      <div className="meta-form">
        <div className="form-grid">
          <Text label="날짜" type="date" value={meta.date} onChange={(v) => set({ date: v })} />
          <Text label="가게" value={meta.store} onChange={(v) => set({ store: v })} list="dl-stores" placeholder="이마트, 쿠팡 …" />
          <Text
            label="금액 (원)"
            numeric
            value={meta.amount}
            onChange={(v) => set({ amount: numberish(v) ?? 0 })}
            hint={won(meta.amount)}
          />
          <Text label="결제" value={meta.payment} onChange={(v) => set({ payment: v })} list="dl-payments" placeholder="신한카드, 현금 …" />
        </div>
        <div className="form-field">
          <span className="form-label">분류</span>
          <div className="seg">
            {[
              ...cats,
              // 목록에 없는 분류가 적힌 글이면 그것도 보여 준다
              ...(str(meta.category) && !cats.includes(str(meta.category)) ? [str(meta.category)] : []),
            ].map((c) => (
              <button type="button" key={c} className={meta.category === c ? "on" : undefined} onClick={() => set({ category: c })}>
                {c}
              </button>
            ))}
            {onAddCategory && <AddCategory onAdd={onAddCategory} onAdded={(c) => set({ category: c })} />}
          </div>
          {onAddCategory && <span className="form-hint">빼기·이름 바꾸기·순서는 구매 목록 화면 아래 &apos;분류 관리&apos;에서</span>}
        </div>
        <div className="form-field">
          <span className="form-label">품목 (선택)</span>
          {items.map((it, i) => (
            <div className="item-row" key={i}>
              <input
                value={it.name}
                placeholder="품목"
                aria-label="품목"
                onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <input
                value={str(it.price)}
                placeholder="금액"
                aria-label="품목 금액"
                inputMode="decimal"
                onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, price: numberish(e.target.value) } : x)))}
              />
              <button type="button" className="icon-btn" aria-label="품목 빼기" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                <X size={14} aria-hidden />
              </button>
            </div>
          ))}
          <button type="button" className="btn add-row" onClick={() => setItems([...items.filter((x) => x.name), { name: "", price: 0 }])}>
            <Plus size={14} aria-hidden /> 품목 추가
          </button>
        </div>
        {tags}
        <datalist id="dl-stores">{s.stores.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id="dl-payments">{s.payments.map((v) => <option key={v} value={v} />)}</datalist>
      </div>
    );
  }

  if (kind === "food") {
    const place = meta.place && typeof meta.place === "object" ? (meta.place as { name?: unknown; lat?: unknown }) : null;
    const rating = typeof meta.rating === "number" ? meta.rating : Number(meta.rating) || 0;
    return (
      <div className="meta-form">
        <div className="form-grid">
          <Text label="날짜" type="date" value={meta.date} onChange={(v) => set({ date: v })} />
          <Text label="식당" value={meta.restaurant} onChange={(v) => set({ restaurant: v })} list="dl-restaurants" placeholder="예: 을지면옥" />
          <Text label="가격 (원)" numeric value={meta.price} onChange={(v) => set({ price: numberish(v) ?? 0 })} hint={won(meta.price)} />
        </div>
        <Chips
          label="메뉴"
          values={list(meta.menu)}
          onChange={(v) => set({ menu: v })}
          suggestions={s.menus ?? []}
          placeholder="예: 평양냉면, 수육 (엔터로 추가)"
        />
        <div className="form-field">
          <span className="form-label">별점</span>
          <div className="stars" role="radiogroup" aria-label="별점">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                type="button"
                key={n}
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n}점`}
                className={n <= rating ? "on" : undefined}
                onClick={() => set({ rating: rating === n ? null : n })}
              >
                <Star size={20} aria-hidden />
              </button>
            ))}
          </div>
        </div>
        <div className="form-field">
          <span className="form-label">장소</span>
          {place?.name ? (
            <span className="place-chip">
              <MapPin size={14} aria-hidden /> {str(place.name)}
              {place.lat === undefined && <span className="muted small"> (좌표 없음)</span>}
              <button type="button" className="icon-btn" aria-label="장소 빼기" onClick={() => set({ place: null })}>
                <X size={14} aria-hidden />
              </button>
            </span>
          ) : (
            <span className="form-hint">사진을 올리면 찍은 곳이 자동으로 들어가요</span>
          )}
          {onAddPlace && (
            <button type="button" className="btn add-row" onClick={onAddPlace}>
              <MapPinPlus size={14} aria-hidden /> {place?.name ? "장소 바꾸기" : "장소 추가"}
            </button>
          )}
        </div>
        <Chips
          label="함께 먹은 사람"
          values={list(meta.people)}
          onChange={(v) => set({ people: v })}
          suggestions={s.people}
          placeholder="예: 엄마, 민수"
        />
        {tags}
        <datalist id="dl-restaurants">{(s.restaurants ?? []).map((v) => <option key={v} value={v} />)}</datalist>
      </div>
    );
  }

  if (kind === "travel") {
    const places = Array.isArray(meta.places) ? (meta.places as unknown[]) : [];
    const placeName = (p: unknown) => (p && typeof p === "object" ? str((p as { name?: unknown }).name) : str(p));
    return (
      <div className="meta-form">
        <Text label="여행 이름" value={meta.title} onChange={(v) => set({ title: v })} placeholder="예: 제주 가족여행" />
        <div className="form-grid">
          <Text label="출발" type="date" value={meta.start} onChange={(v) => set({ start: v })} />
          <Text label="돌아온 날" type="date" value={meta.end} onChange={(v) => set({ end: v })} />
        </div>
        <Chips
          label="함께 간 사람"
          values={list(meta.companions)}
          onChange={(v) => set({ companions: v })}
          suggestions={s.people}
          placeholder="예: 엄마, 동생"
        />
        <div className="form-field">
          <span className="form-label">들른 곳</span>
          {places.length > 0 && (
            <ol className="place-list">
              {places.map((p, i) => (
                <li key={i}>
                  <span>{placeName(p)}</span>
                  {p && typeof p === "object" && "date" in p ? <span className="muted small">{str((p as { date: unknown }).date)}</span> : null}
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`${placeName(p)} 빼기`}
                    onClick={() => set({ places: places.filter((_, j) => j !== i) as Record<string, unknown>[] })}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </li>
              ))}
            </ol>
          )}
          {onAddPlace && (
            <button type="button" className="btn add-row" onClick={onAddPlace}>
              <MapPinPlus size={14} aria-hidden /> 장소 추가
            </button>
          )}
        </div>
        {tags}
      </div>
    );
  }

  // 건강: 자주 재는 것은 늘 보이고, 검진·생활은 값이 있거나 펼쳤을 때
  const extra = Object.keys(meta).filter((k) => !METRICS[k] && !HEALTH_TEXT_KEYS.has(k) && k !== "condition");
  return (
    <div className="meta-form">
      <div className="form-grid">
        <Text label="날짜" type="date" value={meta.date} onChange={(v) => set({ date: v })} />
        <Text label="검진·병원" value={meta.checkup} onChange={(v) => set({ checkup: v })} placeholder="예: 국가건강검진" />
      </div>
      {METRIC_GROUPS.map((g, gi) => {
        const filled = g.metrics.some((m) => meta[m.key] !== undefined && meta[m.key] !== null && meta[m.key] !== "");
        const open = gi === 0 || filled || openGroups[g.title];
        return (
          <fieldset key={g.title} className="metric-group">
            <legend>
              {gi === 0 ? (
                g.title
              ) : (
                <button type="button" onClick={() => setOpenGroups({ ...openGroups, [g.title]: !open })} aria-expanded={!!open}>
                  {open ? "▾" : "▸"} {g.title}
                </button>
              )}
            </legend>
            {open && (
              <div className="form-grid metrics-grid">
                {g.metrics.map((m) => (
                  <Text
                    key={m.key}
                    label={`${m.label}${m.unit ? ` (${m.unit})` : ""}`}
                    numeric
                    value={meta[m.key]}
                    onChange={(v) => set({ [m.key]: numberish(v) })}
                    hint={m.ref}
                  />
                ))}
              </div>
            )}
          </fieldset>
        );
      })}
      {extra.length > 0 && (
        <fieldset className="metric-group">
          <legend>직접 추가한 항목</legend>
          <div className="form-grid metrics-grid">
            {extra.map((k) => (
              <Text key={k} label={k} numeric value={meta[k]} onChange={(v) => set({ [k]: numberish(v) })} />
            ))}
          </div>
        </fieldset>
      )}
      <div className="add-metric">
        <input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="다른 항목 이름 (예: 요산)"
          aria-label="추가할 항목 이름"
        />
        <button
          type="button"
          className="btn"
          disabled={!newKey.trim() || newKey.trim() in meta}
          onClick={() => {
            const k = newKey.trim().replace(/[:#\s]+/g, "_");
            if (k) set({ [k]: null });
            setNewKey("");
          }}
        >
          <Plus size={14} aria-hidden /> 항목 추가
        </button>
      </div>
      {tags}
    </div>
  );
}
