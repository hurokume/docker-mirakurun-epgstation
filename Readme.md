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

#### PX-W3PE4 チューナー (`px4_drv`)

`docker-compose-sample.yml` は `/dev/px4video0` ～ `/dev/px4video3` をコンテナへ渡します。
[px4_drv の仕様](https://github.com/nns779/px4_drv#32-デバイスファイルの確認)では、
`0`・`1` が BS/CS、`2`・`3` が地デジです。デバイスファイルの存在はドライバ側の認識の確認であり、
受信・カード読取りの成功は別途確認が必要です。

既存の `docker-compose.yml` はサンプルの更新だけでは変わりません。
PX-W3PE4 のみを使う場合は、`services.mirakurun.devices` を次の内容に置き換えてください。

```yaml
        devices:
            - /dev/bus:/dev/bus
            - /dev/px4video0:/dev/px4video0
            - /dev/px4video1:/dev/px4video1
            - /dev/px4video2:/dev/px4video2
            - /dev/px4video3:/dev/px4video3
```

ホストに `/dev/dvb` が存在しない場合、元の `/dev/dvb:/dev/dvb` は削除してください。
override ファイルに `devices` を追加するだけでは、元の `/dev/dvb` の指定が残るためです。
変更後、録画していない時間帯に反映・確認します。

```sh
sudo docker-compose up -d
sudo docker-compose exec mirakurun sh -c 'ls -l /dev/px4video*'
sudo docker-compose exec mirakurun sh -c 'command -v recpt1; cat /app-config/tuners.yml'
```

`recpt1` のパスが表示されない場合、コンテナ側への導入も必要です。
ホストにインストールしただけではコンテナから使えません。
`mirakurun/conf/tuners.yml` の `command` に各デバイスを指定し、
`types` は `0`・`1` に `[BS, CS]`、`2`・`3` に `[GR]` を設定します。
例えば地デジのコマンドは `recpt1 --device /dev/px4video2 <channel> - -` です。
`isDisabled: true` の設定は有効化が必要です。

#### NEC CK1506-02 カードリーダー (`0409:018b`)

`docker-compose-sample.yml` には、Mirakurun 起動前に `libccid` の対応リーダー一覧へ
NEC CK1506-02 を追加する設定が含まれています。以前の `docker-compose.yml` 向けには、
`docker-compose.override.yml` でも同じ登録処理を適用します。両方読み込んでも処理は重複しません。
既存の `docker-compose.yml` と同じディレクトリで、通常どおり起動してください。

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

以前の `docker-compose.yml` を使い、`-f` や `COMPOSE_FILE` を指定する運用では
override ファイルも明示してください。新しいサンプルから作成した設定には、この指定は不要です。

```sh
sudo docker-compose -f docker-compose.yml -f docker-compose.override.yml up -d
```

スクリプトだけを変更した場合、`up -d` は既存コンテナを再起動しないことがあります。
その場合は `sudo docker-compose up -d --force-recreate mirakurun` で反映します。
この追加を無効にする場合は override ファイルを外し、`docker-compose.yml` にも登録処理がある場合は
Mirakurun の `command` と `/opt/ccid/add-reader.js` のマウントを削除して、同じコマンドで再作成します。

### EPGStation

* ポート番号: 8888
* ポート番号: 8889

録画ファイル名は `yyyymmdd-hhmmss_番組タイトル（半角）.m2ts` です。
`epgstation/config/config.yml` の設定は次のとおりです。

```yaml
recordedFormat: '%YEAR%%MONTH%%DAY%-%HOUR%%MIN%%SEC%_%HALF_WIDTH_TITLE%'
```

タイトルは EPGStation 標準の `%HALF_WIDTH_TITLE%` を使用します。
既存環境ではテンプレートの更新だけでは反映されないため、実際の `config.yml` も変更してください。
既に録画済みのファイル名は変更されません。

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
