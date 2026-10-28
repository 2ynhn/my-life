// 브라우저 전용: 사진을 줄여서 /api/upload 로 보낸다

const MAX_BYTES = 4 * 1024 * 1024; // 서버 한도와 같게
const MAX_SIDE = 2000;

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지 변환 실패"))), "image/jpeg", quality),
  );
}

/**
 * 휴대폰 사진(수 MB)은 긴 변 2000px JPEG로 줄인다. 작은 PNG(스크린샷)와 GIF는 그대로.
 * 회전 정보(EXIF)는 그림에 반영하고 버린다 → 위치 정보 같은 메타데이터도 함께 빠진다.
 */
export async function prepareImage(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  if (file.type === "image/png" && file.size <= 1.5 * 1024 * 1024) return file;

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  for (const [side, quality] of [
    [MAX_SIDE, 0.85],
    [1600, 0.75],
    [1200, 0.7],
  ] as const) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await toBlob(canvas, quality);
    if (blob.size <= MAX_BYTES) {
      bitmap.close();
      return blob;
    }
  }
  bitmap.close();
  throw new Error("사진이 너무 큽니다.");
}

/** 올린 뒤 파일 이름과 보기 주소를 돌려준다 */
export async function uploadImage(file: File, rootId: string, folderId: string): Promise<{ name: string; url: string }> {
  const blob = await prepareImage(file);
  if (blob.size > MAX_BYTES) throw new Error("사진이 너무 큽니다 (4MB 이하).");
  const res = await fetch(`/api/upload?root=${encodeURIComponent(rootId)}&folder=${encodeURIComponent(folderId)}`, {
    method: "POST",
    headers: { "Content-Type": blob.type || file.type },
    body: blob,
  });
  const body = (await res.json().catch(() => ({}))) as { name?: string; url?: string; error?: string };
  if (!res.ok || !body.name || !body.url) throw new Error(body.error ?? `업로드 실패 (${res.status})`);
  return { name: body.name, url: body.url };
}

export const imageFiles = (list: FileList | null | undefined): File[] =>
  Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
