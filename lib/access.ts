export type Role = "owner" | "guest";

function emailList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** 허용 목록에 없는 이메일이면 null */
export function roleFor(email: string | null | undefined): Role | null {
  if (!email) return null;
  const e = email.toLowerCase();
  if (emailList(process.env.OWNER_EMAILS).includes(e)) return "owner";
  if (emailList(process.env.GUEST_EMAILS).includes(e)) return "guest";
  return null;
}
