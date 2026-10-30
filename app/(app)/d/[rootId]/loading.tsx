import { LocalPreview } from "@/components/LocalPreview";

// 화면을 누르자마자: 기기에 받아 둔 목록·글로 먼저 그리고, 서버 화면이 오면 바뀐다
export default function Loading() {
  return <LocalPreview />;
}
