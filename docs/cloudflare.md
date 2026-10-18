# 外から開く(Cloudflare Tunnel + Cloudflare Access)

アプリは Mac で動かしたまま、Cloudflare Tunnel で外からの入口を作る。Mac のポートは開けない。
鍵は 2 つ。Cloudflare Access(自分のメールアドレスだけ通す)と、アプリのパスキー。片方の設定を誤っても、すぐに中身が見えないようにする。

```
スマホ・外の PC ─HTTPS→ Cloudflare Access ─→ Cloudflare Tunnel ─→ Mac の next start(127.0.0.1)─→ パスキー
```

以下、公開ホスト名を `mail.example.com`、トンネル名を `shiori-mail`、待ち受けポートを 3200 とする。
ダッシュボードの設定は、どれも `mail.example.com` だけに効くように作る。同じドメインの他のサイトには影響させない。

## 1. Cloudflare Access(先に作る)

Tunnel をつなぐ前に作る。順番を逆にすると、Access の無い入口が一時的に公開される。

1. Zero Trust → Access → Applications → Add an application → Self-hosted
2. Application domain: `mail.example.com`(パスは空。サイト全体を守る)
3. Policy: Action = Allow、Include = Emails = 自分のアドレスだけ。Session duration は 24 時間程度
4. ログイン方法は One-time PIN か、2 段階認証を掛けた Google アカウント

## 2. HTTPS への転送とキャッシュ

ドメイン → ルール → Redirect Rules で、テンプレート「Redirect from HTTP to HTTPS」から作る。
テンプレートのままだとドメインのすべてのホストに効くので、次のように絞る。

| 項目 | 値 |
|---|---|
| リクエスト URL(ワイルドカード パターン) | `http://mail.example.com/*` |
| ターゲット URL | `https://mail.example.com/${1}` |
| ステータスコード | 301 |
| クエリ文字列を保持 | オン |

ドメイン → Caching → Cache Rules で、メールの中身を Cloudflare に残さないルールを作る(テンプレートは使わない)。

| 項目 | 値 |
|---|---|
| 条件(カスタム フィルタ式) | ホスト名 次と等しい `mail.example.com` |
| キャッシュの適格性 | キャッシュをバイパスする |

DNS レコードがまだ無いので「このルールはトラフィックに適用されない可能性があります」と出るが、そのまま展開してよい。
4 でトンネルの DNS レコードを作ると効くようになる。ここで新しい DNS レコードは作らない。

SSL/TLS の Always Use HTTPS はドメイン全体に効くので、他のサイトがある場合は使わない。アプリも HTTP で届いたリクエストは 403 で断る。

## 3. アプリの設定

`.env.local` に、公開ホスト名と Access の 2 つの値を書く。

```
MAILER_PUBLIC_HOST=mail.example.com
MAILER_ACCESS_TEAM_DOMAIN=<チーム名>.cloudflareaccess.com
MAILER_ACCESS_AUD=<Application Audience (AUD) Tag>
```

- チーム名: Zero Trust → Settings → Custom Pages(または General)の Team domain
- AUD: Zero Trust → Access → Applications → 1 で作ったアプリ → Overview の Application Audience (AUD) Tag

アプリは、Access が付ける JWT(`Cf-Access-Jwt-Assertion`)の署名・発行元・AUD・期限を確かめ、合わないリクエストを 403 で断る。
Access の設定を誤ったり、Tunnel 以外の経路で届いたりしても、パスキーだけが残る状態にしないため。
2 つの値が無いか不正なときは、公開ホストへのリクエストをすべて断る(localhost はそのまま使える)。

本番ビルドで起動する(dev サーバは外に出さない)。

```
npm run build
npm start -- -p 3200
```

## 4. Tunnel

このアプリ専用のトンネルを作る。他のサービスとトンネルを共有すると、片方を使うためにトンネルを開けたとき、もう片方の入口も開く。

```
cloudflared tunnel create shiori-mail
```

設定は既定の `~/.cloudflared/config.yml` とは別のファイル(例: `~/.cloudflared/shiori-mail.yml`)に書く。

```yaml
tunnel: <トンネルの UUID>
credentials-file: /Users/<ユーザ名>/.cloudflared/<トンネルの UUID>.json

ingress:
  - hostname: mail.example.com
    service: http://127.0.0.1:3200
  - service: http_status:404
```

Host ヘッダはそのまま渡す(`httpHostHeader` は設定しない)。アプリは Host で入口を見分けている。

DNS レコードを作る。**`--config` を必ず付ける。** 付けないと、既定の `config.yml` に書かれた別のトンネルへ向くことがある。出力の `tunnelID` が新しいトンネルのものかを確かめる。

```
cloudflared tunnel --config ~/.cloudflared/shiori-mail.yml route dns <トンネルの UUID> mail.example.com
```

起動する。

```
cloudflared tunnel --no-autoupdate --config ~/.cloudflared/shiori-mail.yml run
```

## 5. 常駐させる(macOS の launchd)

アプリとトンネルを、それぞれ `~/Library/LaunchAgents/` の plist で常駐させる。アプリの例:

```xml
<key>WorkingDirectory</key>
<string>/Users/<ユーザ名>/<このリポジトリ></string>
<key>ProgramArguments</key>
<array>
  <string>/opt/homebrew/bin/npm</string>
  <string>start</string>
  <string>--</string>
  <string>-p</string>
  <string>3200</string>
</array>
<key>EnvironmentVariables</key>
<dict>
  <key>PATH</key>
  <string>/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
</dict>
<key>RunAtLoad</key>
<true/>
<key>KeepAlive</key>
<true/>
```

トンネルの plist は、`ProgramArguments` を 4 の起動コマンドにする。登録・更新・停止は次のとおり(`<label>` は plist の Label)。

```
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/<label>.plist   # 登録して起動
launchctl kickstart -k gui/$(id -u)/<label>                              # 再起動(npm run build のあと)
launchctl bootout gui/$(id -u)/<label>                                   # 止める
```

アプリを更新したら、`npm run build` のあとでアプリの方を再起動する。しないと古い版のまま動き続ける。

## 6. 外で使う端末のパスキーを登録する

パスキーは開いている名前ごとに別物なので、localhost で登録したパスキーは公開ホストでは使えない。
ログインせずに登録できるのは招待リンクからだけ(localhost の最初の 1 つも同じ)。Mac で招待リンクを出して登録する。

```
npm run auth:invite
```

表示された「外の端末」のリンク(10 分間・1 回だけ有効)を、登録したい端末で開く。Access のログインを済ませると登録画面に戻る。
iCloud キーチェーンのパスキーなら、Apple の他の端末にも同期される。

## 確かめること

- Access を通らずに `https://mail.example.com` を開くと、Cloudflare Access のログイン画面へ転送される
- Access を通ったあとは、ふだんどおり開ける(403 になるなら `MAILER_ACCESS_*` の値とアプリのログを確かめる)
- `http://mail.example.com` は HTTPS へ転送される
- 招待リンクは 2 回目には使えない
