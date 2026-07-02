# weather-discord-bot

GitHub ActionsでOpen-Meteoから天気を取得し、Discord Webhookへ投稿するサンプルです。

## 主な内容

- 04:00: 鶴見駅24時間詳細、鶴見駅4日予報、気温比較、周辺駅簡易予報
- 10:00 / 16:00 / 22:00: 鶴見駅24時間詳細のみ
- 24時間詳細は3時間ごとを基本に、降水0.5mm/h以上または強風時間を追加表示
- 4日先までの次の雨判定は降水1.0mm/h以上
- 風速はm/s表示
- 過去気温比較はOpen-Meteoの再解析データを使用
- Discord投稿は表ではなく、絵文字付きのラベル行形式

## 必須Secret

GitHubのRepository secretsに以下を登録してください。

```text
DISCORD_WEBHOOK_URL
```

## 手動実行

Actionsの `Post weather to Discord` から `Run workflow` を押します。

`report_mode`:

- `auto`: 04時なら全部、それ以外は24時間詳細のみ
- `full`: 全部投稿
- `tsurumi24`: 鶴見駅24時間詳細のみ
