import { readCategories } from "@/lib/categories";
import { gatherRecords, peopleOf, tagsOf, topCounts } from "@/lib/collect";
import { loadLibrary } from "@/lib/library";
import { getUser } from "@/lib/session";

// 입력 폼 자동 완성: 이 일기장에서 자주 쓴 키워드·사람·가게·결제 수단 (로그인한 사람 토큰으로 읽음)

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const root = new URL(req.url).searchParams.get("root") ?? "";
  const loaded = await loadLibrary(user, root);
  if (loaded.kind !== "ok") return Response.json({ error: "일기장을 열 수 없습니다." }, { status: 404 });

  const [{ records }, categories] = await Promise.all([gatherRecords(loaded.index), readCategories(loaded.index)]);
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const spending = records.filter((r) => r.feature === "spending");
  const food = records.filter((r) => r.feature === "food");
  const strings = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : []);
  return Response.json(
    {
      tags: topCounts(records.flatMap(tagsOf)),
      people: topCounts(records.flatMap(peopleOf)),
      stores: topCounts(spending.map((r) => text(r.meta.store)).filter(Boolean), 50),
      payments: topCounts(spending.map((r) => text(r.meta.payment)).filter(Boolean), 15),
      categories,
      restaurants: topCounts(food.map((r) => text(r.meta.restaurant)).filter(Boolean), 50),
      menus: topCounts(food.flatMap((r) => strings(r.meta.menu)), 50),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
