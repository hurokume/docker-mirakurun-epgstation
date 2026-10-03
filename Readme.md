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
# epgstationとsambaを更新
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

### 録画後の HEVC 自動変換

新しい録画が終了すると `recordingFinishCommand` が EPGStation の API を使って
HEVC のエンコードを登録します。予約ごとにエンコードを指定する必要はありません。
元の TS は残し、変換結果も EPGStation の録画一覧に登録されます。

| 種類 | ホストの保存先 | EPGStation 内 | Samba 共有 |
| --- | --- | --- | --- |
| TS（`.m2ts`） | `./recorded` | `/app/recorded` | `Shared` |
| HEVC + AAC（`.mp4`） | `./converted` | `/app/converted` | `Converted` |

例: `Shared/20261003-210000_番組タイトル.m2ts` を残したまま、
`Converted/20261003-210000_番組タイトル.mp4` を作成します。
保存先の内部名 `recorded` は維持しているので、既存の TS を移動する必要はありません。
`converted` は変換用の保存先です。予約の録画先は `recorded` にしてください。

変換には CPU の `libx265` を使い、`veryfast` / CRF 26 / 同時 1 件としています。
解像度は維持し、インターレースを解除します。HEVC 対応の FFmpeg は既存の
Debian / Alpine Dockerfile に含まれます。設定は `epgstation/scripts/encode-hevc.js` にあります。
既存の `H.264` モードも引き続き利用できます。

既存環境は `docker-compose.yml` にサンプルと同じ `converted` と `scripts` のマウントを追加し、
実際の `epgstation/config/config.yml` にも次の項目を反映してください。
`recorded` / `encode` は既存のリストに項目を追加し、同じキーを二重に作らないでください。

```yaml
recorded:
    - name: recorded
      path: '%ROOT%/recorded'
    - name: converted
      path: '%ROOT%/converted'
recordingFinishCommand: 'node /app/scripts/auto-encode.js'
encode:
    - name: HEVC
      cmd: '%NODE% %ROOT%/scripts/encode-hevc.js'
      suffix: .mp4
      rate: 10.0
    # 既存の H.264 などはこの後に残す
```

初回のマウント追加は `sudo docker-compose up -d` で反映されます。
その後 `config.yml` だけを変更した場合は `sudo docker-compose restart epgstation` で読み直します。
すでに別の `recordingFinishCommand` がある場合は、既存処理とこのスクリプトを呼ぶラッパーにまとめてください。
EPGStation の待機中・実行中キューおよび変換済み情報を確認し、同じ録画の HEVC の二重登録を避けます。
既存の予約・ルールにエンコード指定がある場合は、自動処理との重複を避けるため外し、
**「エンコード後に元ファイルを削除」を無効**にしてください。

対象は設定反映後に終了した録画です。過去の TS は一括変換しません。
キュー登録の成否は `epgstation/logs/auto-encode.log`、変換状況は EPGStation のエンコード画面で確認できます。
API の一時的な起動待ちは再試行しますが、登録エラーや変換失敗はログを確認し、
EPGStation の画面からモード `HEVC`・保存先 `converted`・元ファイル削除なしで再実行してください。
TS は変換中も保持されます。変換が完了するまで元の TS を削除しないでください。

### Samba 共有

`samba` サービスが録画フォルダ `./recorded` を共有名 `Shared`、
HEVC 変換先 `./converted` を共有名 `Converted` で公開します。
どちらもゲストアクセスで、読取り・書込み・削除を許可しています。

```sh
sudo docker-compose up -d
sudo docker-compose logs --tail=100 samba
```

* Windows: エクスプローラーで `\\tv\Shared` / `\\tv\Converted`（`tv` は IP アドレスでも可）
* macOS / Linux: `smb://tv/Shared` / `smb://tv/Converted`
* ユーザー名・パスワード: 不要（ゲスト）
* 公開ポート: TCP 445（SMB2 / SMB3）

名前で接続できない場合は IP アドレスを指定してください。
同じホストで既存の Samba などが TCP 445 を使用している場合は、ポートの競合を解消してから起動します。
ホストのファイアウォールを使用している場合は、接続元 LAN からの TCP 445 を許可してください。

設定は `samba/smb.conf` にあります。共有内の操作は `force user = root` とし、
EPGStation が標準設定で作成する root 所有の録画ファイルも操作できるようにしています。
共有するホストフォルダは `./recorded` と `./converted` です。ホスト側の所有者や権限の一括変更は行いません。
Samba 経由で動画を削除しても EPGStation の録画管理情報は自動削除されないため、
通常の録画削除は EPGStation の画面から行ってください。

Windows の設定によってはゲスト接続や署名なしの接続が拒否されます。
その場合は接続する Windows 側の設定を確認してください
（[Microsoft のゲストログオンに関する説明](https://learn.microsoft.com/en-us/windows-server/storage/file-server/enable-insecure-guest-logons-smb2-and-smb3)）。

既存環境では `docker-compose-sample.yml` の `samba` サービスと `samba-state` ボリュームを
実際の `docker-compose.yml` にも反映してください。
`smb.conf` の変更後は `sudo docker-compose restart samba`、
Dockerfile の変更後は `sudo docker-compose up -d --build samba` で反映します。

### 各種ファイル保存先

* 録画 TS データ（Shared）

```./recorded```

* HEVC 変換データ（Converted）

```./converted```

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
