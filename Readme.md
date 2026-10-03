# docker-mirakurun-epgstation

[Mirakurun](https://github.com/Chinachu/Mirakurun) + [EPGStation](https://github.com/l3tnun/EPGStation) の Docker コンテナ

## 前提条件

- Docker, docker-compose の導入が必須
- ホスト上の pcscd は停止する
- チューナーのドライバが適切にインストールされていること

## インストール手順

```sh
curl -sf https://raw.githubusercontent.com/l3tnun/docker-mirakurun-epgstation/v2/setup.sh | sh -s
cd docker-mirakurun-epgstation

#チャンネル設定
vim mirakurun/conf/channels.yml

#コメントアウトされている restart や user の設定を適宜変更する
vim docker-compose.yml
```

## 起動

```sh
sudo docker-compose up -d
```

## チャンネルスキャン地上波のみ(取得漏れが出る場合もあるので注意)

```sh
curl -X PUT "http://localhost:40772/api/config/channels/scan"
```

mirakurun の EPG 更新を待ってからブラウザで http://DockerHostIP:8888 へアクセスし動作を確認する

## 停止

```sh
sudo docker-compose down
```

## 更新

```sh
# mirakurunとdbを更新
sudo docker-compose pull
# epgstationを更新
sudo docker-compose build --pull
# 最新のイメージを元に起動
sudo docker-compose up -d
```

## 設定

### Mirakurun

* ポート番号: 40772

#### NEC CK1506-02 カードリーダー (`0409:018b`)

`docker-compose.override.yml` が、Mirakurun 起動前に `libccid` の対応リーダー一覧へ
NEC CK1506-02 を追加します。既存の `docker-compose.yml` と同じディレクトリで、通常どおり起動してください。

```sh
sudo docker-compose up -d
sudo docker-compose logs --tail=100 mirakurun
sudo docker-compose exec mirakurun pcsc_scan
```

`[ccid] Registered 0409:018b ...` または `[ccid] 0409:018b already registered ...` が登録結果です。
`pcsc_scan` でリーダー名とカードの ATR が表示されることを確認し、Ctrl+C で終了します。
ID の登録だけでカードとの通信が保証されるわけではないため、最後に視聴・録画も確認してください。
初回の反映では Mirakurun コンテナが再作成されるため、録画していない時間帯に実行してください。

追加スクリプト `mirakurun/add-ccid-reader.js` は読み取り専用でコンテナへ渡され、
コンテナ内の `Info.plist` だけを更新します。ホスト側の定義ファイルの編集やイメージの再ビルドは不要です。
既に登録されている VID/PID の組は追加せず、配列の要素数などが不正な場合はエラーを出して起動を止めます。
コンテナの再作成やイメージ更新後にも、起動時に同じ設定が適用されます。
ホスト側の `pcscd.service` と `pcscd.socket` は停止し、コンテナとの USB 競合を避けてください。

`-f` や `COMPOSE_FILE` を指定する運用では override ファイルも明示してください。

```sh
sudo docker-compose -f docker-compose.yml -f docker-compose.override.yml up -d
```

スクリプトだけを変更した場合、`up -d` は既存コンテナを再起動しないことがあります。
その場合は `sudo docker-compose up -d --force-recreate mirakurun` で反映します。
この追加を無効にする場合は override ファイルを外し、同じコマンドで Mirakurun を再作成します。

### EPGStation

* ポート番号: 8888
* ポート番号: 8889

### 各種ファイル保存先

* 録画データ

```./recorded```

* サムネイル

```./epgstation/thumbnail```

* 予約情報と HLS 配信時の一時ファイル

```./epgstation/data```

* EPGStation 設定ファイル

```./epgstation/config```

* EPGStation のログ

```./epgstation/logs```

## v1からの移行について

[docs/migration.md](docs/migration.md)を参照
