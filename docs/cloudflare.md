# 外から開く(Cloudflare Tunnel + Cloudflare Access)

アプリは Mac で動かしたまま、Cloudflare Tunnel で外からの入口を作る。Mac のポートは開けない。
鍵は 2 つ。Cloudflare Access(自分のメールアドレスだけ通す)と、アプリのパスキー。片方の設定を誤っても、すぐに中身が見えないようにする。

```
スマホ・外の PC ─HTTPS→ Cloudflare Access ─→ Cloudflare Tunnel ─→ Mac の next start(127.0.0.1)─→ パスキー
```

以下、公開ホスト名を `mail.example.com`、待ち受けポートを 3200 とする。

## 1. Cloudflare Access(先に作る)

Tunnel をつなぐ前に作る。順番を逆にすると、Access の無い入口が一時的に公開される。

1. Zero Trust → Access → Applications → Add an application → Self-hosted
2. Application domain: `mail.example.com`(パスは空。サイト全体を守る)
3. Session duration: 24 時間程度
4. Policy: Action = Allow、Include = Emails = 自分のアドレスだけ
5. ログイン方法は One-time PIN か、2 段階認証を掛けた Google アカウント

## 2. キャッシュと HTTPS

- SSL/TLS → Edge Certificates → Always Use HTTPS をオンにする(アプリは HTTP で届いたリクエストを 403 で断る)
- Caching → Cache Rules で `mail.example.com` を Bypass cache にする。メールの中身を Cloudflare に残さない

## 3. アプリの設定

`.env.local` に公開ホスト名を書く。

```
MAILER_PUBLIC_HOST=mail.example.com
```

本番ビルドで起動する(dev サーバは外に出さない)。

```
npm run build
npm start -- -p 3200
```

## 4. Tunnel の入口

`~/.cloudflared/config.yml` の `ingress` に、末尾の `- service: http_status:404` より前に追加する。

```yaml
  - hostname: mail.example.com
    service: http://localhost:3200
```

`cloudflared tunnel route dns <トンネル名> mail.example.com` で DNS を作り、cloudflared を再起動する。
Host ヘッダはそのまま渡す(`httpHostHeader` は設定しない)。アプリは Host で入口を見分けている。

## 5. 外で使う端末のパスキーを登録する

パスキーは開いている名前ごとに別物なので、localhost で登録したパスキーは公開ホストでは使えない。
公開ホストでは、初回でもログインせずに登録することはできない。Mac で招待リンクを出して登録する。

```
npm run auth:invite
```

表示されたリンク(10 分間・1 回だけ有効)を、登録したい端末で開く。iCloud キーチェーンのパスキーなら、Apple の他の端末にも同期される。

## 確かめること

- Access を通らずに `https://mail.example.com` を開くと、Cloudflare のログイン画面になる
- `http://mail.example.com` は HTTPS へ移る
- 招待リンクは 2 回目には使えない
