// my-life 서비스 워커: 휴대폰 '공유하기'로 받은 이미지·글을 브라우저 안(Cache Storage)에만 잠깐 두고
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
        await Promise.all([cache.delete("/__share/image"), cache.delete("/__share/text")]);
        const image = form.getAll("image").find((f) => typeof f !== "string" && f.size > 0 && /^image\//.test(f.type));
        if (image) await cache.put("/__share/image", new Response(image, { headers: { "Content-Type": image.type } }));
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
