// 휴대폰 '공유하기'로 받은 것을 브라우저 안(Cache Storage)에 잠깐 두는 곳 (public/sw.js가 넣고, 화면이 꺼내 씀)
// 키: /__share/count (이미지 장수), /__share/image/0 … , /__share/text

export const SHARE_CACHE = "my-life-share";

async function open() {
  return caches.open(SHARE_CACHE);
}

/** 받은 이미지들과 글 (지우지 않고 보기만) */
export async function peekShared(): Promise<{ images: Blob[]; text: string }> {
  try {
    const cache = await open();
    const count = Number(await (await cache.match("/__share/count"))?.text()) || 0;
    const images: Blob[] = [];
    for (let i = 0; i < count; i++) {
      const res = await cache.match(`/__share/image/${i}`);
      if (res) images.push(await res.blob());
    }
    const text = (await (await cache.match("/__share/text"))?.text()) ?? "";
    return { images, text };
  } catch {
    return { images: [], text: "" };
  }
}

/** 이미지들을 꺼낸다 (꺼내면 브라우저에서 지움) */
export async function takeSharedImages(): Promise<Blob[]> {
  const { images } = await peekShared();
  await clearShared("images");
  return images;
}

export async function clearShared(what: "images" | "text" | "all" = "all") {
  try {
    const cache = await open();
    const keys = await cache.keys();
    await Promise.all(
      keys
        .filter((k) => {
          const p = new URL(k.url).pathname;
          return what === "all" || (what === "text" ? p === "/__share/text" : p !== "/__share/text");
        })
        .map((k) => cache.delete(k)),
    );
  } catch {}
}
