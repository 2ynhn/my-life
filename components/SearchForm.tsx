"use client";

import { useRouter } from "next/navigation";

// 검색창: 전체 페이지를 다시 받지 않고 앱 안에서 넘어간다. 기기 사본으로 그릴 수 있으면 누르는 순간 그린다 (LocalNav)
export function SearchForm({ action, className, children }: { action: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <form
      className={className}
      action={action}
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const params = new URLSearchParams();
        for (const [k, v] of new FormData(e.currentTarget, submitter)) if (typeof v === "string") params.set(k, v);
        const href = `${action}?${params}`;
        window.dispatchEvent(new CustomEvent("my-life:navigate", { detail: href }));
        router.push(href);
      }}
    >
      {children}
    </form>
  );
}
