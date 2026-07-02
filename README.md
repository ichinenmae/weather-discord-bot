# weather-discord-bot

GitHub ActionsでOpen-Meteoから天気を取得し、Discord Webhookへ投稿する最小構成です。

## 投稿スケジュール

- JST 04:00: ① 鶴見駅24時間詳細 + ② 鶴見駅の雨・気温比較・4日予報 + ③ 周辺駅簡易予報
- JST 10:00: ①のみ
- JST 16:00: ①のみ
- JST 22:00: ①のみ

## 仕様

### ① 鶴見駅周辺の向こう24時間の詳細予報

- 3時間ごとに表示
- ただし、次の条件に当てはまる時間は1時間単位で追加表示
  - 降水量 0.5mm/h 以上
  - 風速 8m/s 以上
  - 突風 15m/s 以上
- 風速は m/s 表示

### ② 鶴見駅周辺

- 4日先までで次に降水量1mm/h以上が出る日時
- 前日との最高・最低・平均気温比較
- 過去3日/7日の平均気温との比較
- 4日先までの日別予報
- 過去値はOpen-Meteoの再解析データを使用

### ③ 周辺駅の簡易予報

- 川崎駅、横浜駅、武蔵小杉駅、蒲田駅
- 二俣川駅、東戸塚駅、水道橋駅
- 当日と翌日の日別予報

## GitHub Secrets

Repository secrets に以下を登録してください。

```text
DISCORD_WEBHOOK_URL
```

## 手動実行

Actions → Post weather to Discord → Run workflow

`report_mode` は以下を指定できます。

```text
auto      04時なら全部、それ以外なら①のみ
full      ①②③を全部投稿
tsurumi24 ①のみ投稿
```

## 降水量しきい値

```text
24時間詳細予報: 0.5mm/h以上で1時間単位表示
4日先までの次の雨予報: 1.0mm/h以上
```
