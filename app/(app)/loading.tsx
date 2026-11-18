import { PageSkeleton } from "@/components/PageSkeleton";

// 앱을 처음 열 때는 이 자리표시 위에 기기 사본(BootPreview, 레이아웃)이 먼저 보인다
export default function Loading() {
  return <PageSkeleton />;
}
