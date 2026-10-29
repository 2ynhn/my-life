// my-life 서비스 워커: 휴대폰 '공유하기'로 받은 이미지(여러 장)·글을 브라우저 안(Cache Storage)에만 잠깐 두고
// /share 화면으로 넘긴다. 서버나 Drive에 파일을 만들지 않는다. 다른 요청은 건드리지 않는다.

const CACHE = "my-life-share";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.origin !== self.location.origin || url.pathname !== "/share-target") return;
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const cache = await caches.open(CACHE);
        // 지난번 것은 지우고 이번 것만 (이미지는 여러 장, 10장까지)
        await Promise.all((await cache.keys()).map((k) => cache.delete(k)));
        const images = form
          .getAll("image")
          .filter((f) => typeof f !== "string" && f.size > 0 && /^image\//.test(f.type))
          .slice(0, 10);
        await Promise.all(images.map((img, i) => cache.put(`/__share/image/${i}`, new Response(img, { headers: { "Content-Type": img.type } }))));
        await cache.put("/__share/count", new Response(String(images.length)));
        const text = ["title", "text", "url"]
          .map((k) => form.get(k))
          .filter((v) => typeof v === "string" && v.trim())
          .join("\n")
          .trim();
        if (text) await cache.put("/__share/text", new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } }));
      } catch (e) {
        console.error("[sw] share", e);
      }
      return Response.redirect("/share", 303);
    })(),
  );
});
