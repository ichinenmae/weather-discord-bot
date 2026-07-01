# weather-discord-bot

GitHub Actions で天気を取得し、Discord Webhook に投稿する最小構成です。Codex は不要です。

## 使うもの

- GitHub リポジトリ
- Discord Webhook URL
- Open-Meteo API（APIキー不要）

## ファイル構成

```text
.github/workflows/post-weather.yml
scripts/post-weather.mjs
package.json
```

## Discord Webhook URL の作成

Discord の投稿したいチャンネルで以下を行います。

1. チャンネル設定
2. 連携サービス
3. ウェブフック
4. 新しいウェブフック
5. Webhook URL をコピー

## GitHub Secrets に登録

GitHub リポジトリで以下を開きます。

`Settings` → `Secrets and variables` → `Actions` → `New repository secret`

登録内容:

- Name: `DISCORD_WEBHOOK_URL`
- Secret: Discord Webhook URL

## 投稿時刻の変更

`.github/workflows/post-weather.yml` のこの部分を編集します。

```yaml
schedule:
  - cron: '0 10,16,21 * * *'
    timezone: 'Asia/Tokyo'
```

上記は毎日 10:00 / 16:00 / 21:00 に実行します。

## 地点の変更

`.github/workflows/post-weather.yml` の `LATITUDE` / `LONGITUDE` を変更します。

```yaml
LATITUDE: '35.5086'
LONGITUDE: '139.6763'
PLACE_NAME: '横浜市鶴見区付近'
```

## 手動実行

GitHub の `Actions` タブで `Post weather to Discord` を選び、`Run workflow` を押します。

## ローカルで試す場合

PowerShell 例:

```powershell
$env:DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/...."
npm run post-weather
```

Webhook URL は公開リポジトリに直接書かないでください。
