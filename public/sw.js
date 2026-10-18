// 新着メールの通知を受けて表示する Service Worker。設定画面の「通知を受け取る」で登録する。

// 新しい版を登録したら、古い版(同じオリジンの別のアプリのものを含む)を待たずにすぐ入れ替える。
// 待たせると、通知が古い版に届いて表示されない
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    (async () => {
      // いま Shiori を開いて見ているなら、通知は出さない(画面の一覧に出る)
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.some((w) => w.visibilityState === "visible") && data.tag !== "test") return;
      await self.registration.showNotification(data.title, {
        body: data.body,
        tag: data.tag,
        icon: "/icons/icon-192.png",
        data: { url: data.url },
      });
    })(),
  );
});

// 通知をタップしたら、そのメールを開く。開いている画面があればそれを使う
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // 開くのはこのアプリの中だけ。通知の中身を作れるのはサーバだけだが、念のため別のサイトへは飛ばさない
  const target = new URL(event.notification.data?.url ?? "/mail/inbox", self.location.origin);
  const url = target.origin === self.location.origin ? target.href : new URL("/mail/inbox", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of windows) {
        // navigate はこの Service Worker が受け持っている画面でしか使えない。だめなら新しく開く
        const moved = await w.navigate(url).catch(() => null);
        if (moved) return moved.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
