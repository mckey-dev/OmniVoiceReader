# OmniVoice Reader

Version: **1.0.0**  
更新日: 2026-09-14

ローカルの OmniVoice TTS と Chrome 拡張で、Web ページの日本語を読み上げるプロジェクトです。

- サーバー: 手元の GPU（AMD ROCm / NVIDIA CUDA）または CPU で音声を生成する
- 拡張: ページ本文、または選択したテキストだけを読み上げる
- 再生中は、現在の文をページ上でハイライトする
- 声は `voice/sample.wav`（または `sample.mp3` / `sample.ogg` などから変換）から作ったクローン用プロンプトを使う

この環境の GPU は次の 2 枚です。

- NVIDIA GeForce RTX 2060 SUPER（推奨。`start_cuda.bat`）
- AMD Radeon 780M / gfx1103 + ROCm 10（`start_amd.bat`）

この環境の NVIDIA ドライバは 616.92（CUDA 13.4）です。CUDA で動かす場合は `start_cuda.bat` を使います。

## ブランチ運用

| ブランチ | 用途 |
| --- | --- |
| `main` | 安定版。現在の固定リリースは **v1.0.0** |
| `dev` | 今後の機能実装・企画用 |

新しい機能は `dev` で進め、安定したら `main` へ取り込み、必要に応じてバージョンタグを付けます。

## 必要なもの

- Windows（Linux 用の起動スクリプトもあります）
- Python 3.12 相当
- Google Chrome
- GPU を使う場合は、対応する PyTorch（ROCm または CUDA）
- 声クローン用の参照音声 `voice/sample.wav`、`voice/sample.mp3`、`voice/sample.ogg` など（書き起こし `voice/sample.txt` は無ければ自動作成）

## ディレクトリの見取り

| パス | 内容 |
| --- | --- |
| `server/` | ローカル TTS サーバー（`python -m server` → `http://127.0.0.1:8000`） |
| `server/sampling/` | 参照音声の変換と声クローン用プロンプトの作成 |
| `extension/` | Chrome 拡張（MV3） |
| `extension/settings.json` | 速度・音量・生成オプション |
| `models/OmniVoice` | TTS モデル。無ければ起動時にダウンロード |
| `models/whisper-large-v3-turbo` | `voice/sample.txt` 自動作成用 |
| `voice/` | 参照音声・書き起こし・声クローン用プロンプト・確認用 WAV |
| `test/test_client.html` | 拡張を使わないブラウザ単体の試験 UI |
| `test/test_sentence_split.mjs` | 文分割の確認用 |

## 1. 仮想環境と依存パッケージ

起動スクリプトは、仮想環境が無ければ作成してパッケージを入れます。

| 起動 | 仮想環境 | 依存ファイル | 用途 |
| --- | --- | --- | --- |
| `start.bat` / `start.sh` | `venv` | `requirements.txt` | CPU |
| `start_amd.bat` / `start_amd.sh` | `venv_amd` | `requirements_amd.txt` | AMD GPU / ROCm |
| `start_cuda.bat` / `start_cuda.sh` | `venv_cuda` | `requirements_cuda.txt` | NVIDIA CUDA |

手動で作る場合:

```powershell
cd C:\app\OmniVoiceReader
python -m venv venv_amd
.\venv_amd\Scripts\Activate.ps1
python -m pip install -U pip
python -m pip install -r requirements_amd.txt
```

注意:

- `requirements_amd.txt` の `torch==2.13.0+rocm10.0.0` などは、通常の PyPI だけでは入りません。AMD ROCm / TheRock 向けの wheel を入れてください。
- `requirements_cuda.txt` の既定は `torch==2.14.0+cu130` です。環境に合わせて `cu126` / `cu130` / `cu132` に差し替えできます。

## 2. モデル

モデルはリポジトリ直下の `models` に置きます。Hugging Face のユーザーキャッシュは使いません。

| フォルダ | 用途 |
| --- | --- |
| `models/OmniVoice` | TTS。無ければ起動時に `k2-fsa/OmniVoice` をダウンロード |
| `models/whisper-large-v3-turbo` | `voice/sample.txt` 自動作成用。無ければ書き起こし時にダウンロード |

## 3. 声クローン用プロンプト

`voice/sample.wav` が無いと、サーバーは起動しません。`voice/sample.mp3` / `voice/sample.ogg` / `voice/sample.oga` / `voice/sample.flac` があれば、起動時に `voice/sample.wav` へ変換します。起動スクリプトも同じ条件です。

サーバーは起動時に `voice/voice_clone_prompt.pt` を読み込みます。このファイルが無くて参照音声がある場合、起動スクリプトが自動で作成します。

手動で作る場合:

```powershell
.\venv_amd\Scripts\Activate.ps1
python -m server.sampling.build_voice_prompt
```

`voice/sample.txt` が無ければ Whisper で書き起こします。WAV / OGG / FLAC は `soundfile`、MP3 は `miniaudio` で読むので ffmpeg は不要です。既にある `voice/sample.txt` は、手修正した内容を優先します。

## 4. TTS サーバーの起動

Windows:

```bat
start.bat
start_amd.bat
start_cuda.bat
```

Linux:

```bash
chmod +x start.sh start_amd.sh start_cuda.sh
./start.sh
./start_amd.sh
./start_cuda.sh
```

手動で起動する場合:

```powershell
.\venv_amd\Scripts\Activate.ps1
python -m server
```

起動後:

| URL | 内容 |
| --- | --- |
| http://127.0.0.1:8000/ | 稼働確認 |
| http://127.0.0.1:8000/health | ヘルスチェック |
| `POST /tts` | 読み上げ。本文は `{"text": "こんにちは。"}` |
| http://127.0.0.1:8000/tts/defaults | 生成オプションの既定値 |
| http://127.0.0.1:8000/tts/languages | OmniVoice が受け付ける language 一覧 |
| http://127.0.0.1:8000/extension/settings | 拡張設定の読み書き |

`POST /tts` で省略できる項目と、サーバー既定値は次のとおりです。

| 項目 | 既定 |
| --- | --- |
| `instruct` | 空（未指定。下の「instruct の書き方」を参照） |
| `language` | `auto`（本文から判定。下の「language の選び方」を参照） |
| `num_step` | 32 |
| `guidance_scale` | 2.0 |
| `t_shift` | 0.1 |
| `position_temperature` | 5.0 |
| `class_temperature` | 0.0 |
| `denoise` | true |

既定値は `server/app.py` の `DEFAULT_*` で変えます。拡張ポップアップの「生成設定」と `test/test_client.html` からも同じ項目を送れます。

### instruct の書き方

`instruct` は自由文ではありません。OmniVoice 0.2.1 が認めるタグだけを、カンマで並べます。空、または未指定なら声クローンだけが使われます。

このプロジェクトは常に `voice/sample.wav` 由来の声クローンを使います。`instruct` を入れると、その声の上に性別・年齢・音高・スタイル・口音／方言の指定が乗ります。リストに無い語（`happy` や「ゆっくりめに」など）は `ValueError` になります。

書き方:

- 英語タグは半角カンマ＋空白（例: `male, indian accent`）。大文字小文字は区別しない
- 中国語タグは全角カンマ（例: `男，河南话`）
- 英語だけ、または中国語だけにする。混ぜない
- 各カテゴリから最大 1 つ。`male, female` は不可
- 英語の口音と中国語の方言は同時に指定できない
- カンマの種類が違っていても、OmniVoice 側で直す
- 下の「日本語」は意味の説明です。`instruct` に日本語は書けません

#### 性別

| 英語 | 中国語 | 日本語 |
| --- | --- | --- |
| `male` | `男` | 男性 |
| `female` | `女` | 女性 |

#### 年齢

| 英語 | 中国語 | 日本語 |
| --- | --- | --- |
| `child` | `儿童` | 子供 |
| `teenager` | `少年` | 少年（10代） |
| `young adult` | `青年` | 青年 |
| `middle-aged` | `中年` | 中年 |
| `elderly` | `老年` | 老年 |

#### 音高

| 英語 | 中国語 | 日本語 |
| --- | --- | --- |
| `very low pitch` | `极低音调` | かなり低い声 |
| `low pitch` | `低音调` | 低い声 |
| `moderate pitch` | `中音调` | 普通の声の高さ |
| `high pitch` | `高音调` | 高い声 |
| `very high pitch` | `极高音调` | かなり高い声 |

#### スタイル

| 英語 | 中国語 | 日本語 |
| --- | --- | --- |
| `whisper` | `耳语` | ささやき声 |

#### 英語の口音（英語の本文向け。中国語タグは無い）

| 英語 | 日本語 |
| --- | --- |
| `american accent` | アメリカ英語の口音 |
| `british accent` | イギリス英語の口音 |
| `australian accent` | オーストラリア英語の口音 |
| `canadian accent` | カナダ英語の口音 |
| `indian accent` | インド英語の口音 |
| `chinese accent` | 中国語なまりの英語 |
| `japanese accent` | 日本語なまりの英語 |
| `korean accent` | 韓国語なまりの英語 |
| `portuguese accent` | ポルトガル語なまりの英語 |
| `russian accent` | ロシア語なまりの英語 |

#### 中国語の方言（中国語の本文向け。英語タグは無い）

| 中国語 | 日本語 |
| --- | --- |
| `河南话` | 河南方言 |
| `陕西话` | 陝西方言 |
| `四川话` | 四川方言 |
| `贵州话` | 貴州方言 |
| `云南话` | 雲南方言 |
| `桂林话` | 桂林方言 |
| `济南话` | 済南方言 |
| `石家庄话` | 石家荘方言 |
| `甘肃话` | 甘粛方言 |
| `宁夏话` | 寧夏方言 |
| `青岛话` | 青島方言 |
| `东北话` | 東北方言 |

#### 組み合わせ例

| instruct | 日本語での意味 |
| --- | --- |
| `male` | 男性 |
| `female, young adult` | 女性、青年 |
| `male, elderly, low pitch` | 男性、老年、低い声 |
| `female, whisper` | 女性、ささやき声 |
| `male, indian accent` | 男性、インド英語の口音 |
| `female, british accent, high pitch` | 女性、イギリス英語の口音、高い声 |
| `男` | 男性 |
| `女，青年` | 女性、青年 |
| `男，老年，低音调` | 男性、老年、低い声 |
| `女，耳语` | 女性、ささやき声 |
| `男，四川话` | 男性、四川方言 |
| `女，东北话，中音调` | 女性、東北方言、普通の声の高さ |

使えない例:

| 入力 | 理由 |
| --- | --- |
| `happy, energetic` | リストに無い英語 |
| `ゆっくり、明るく` | 日本語はタグとして使えない |
| `male, female` | 性別を 2 つ指定している |
| `indian accent, 四川话` | 英語の口音と中国語の方言を混ぜている |

### language の選び方

OmniVoice 0.2.1 は **646 言語** を受け付けます。ポップアップと `test/test_client.html` の language から選べます。検索欄に `ja` や `日本語`、`French` などを入れると絞り込めます。

特別な値:

| 値 | 意味 |
| --- | --- |
| `auto` | 本文から判定する（既定） |
| `none` | 言語を渡さない（OmniVoice の language-agnostic） |

`auto` の判定:

1. ハングルが多ければ `Korean`
2. ひらがな・カタカナがあれば `Japanese`
3. 漢字だけでかな等が無ければ `Chinese`
4. ラテン文字が多ければ `English`
5. どれでもなければ `Japanese`

それ以外の言語のページでは、一覧から固定してください。値は英語名（`Japanese`）でも ISO コード（`ja`）でも送れます。

よく使う例:

| 値 | コード | 日本語 |
| --- | --- | --- |
| `Japanese` | `ja` | 日本語 |
| `English` | `en` | 英語 |
| `Chinese` | `zh` | 中国語 |
| `Cantonese` | `yue` | 広東語 |
| `Korean` | `ko` | 韓国語 |
| `French` | `fr` | フランス語 |
| `German` | `de` | ドイツ語 |
| `Spanish` | `es` | スペイン語 |
| `Portuguese` | `pt` | ポルトガル語 |
| `Italian` | `it` | イタリア語 |
| `Russian` | `ru` | ロシア語 |
| `Standard Arabic` | `arb` | アラビア語（標準） |
| `Hindi` | `hi` | ヒンディー語 |
| `Vietnamese` | `vi` | ベトナム語 |
| `Thai` | `th` | タイ語 |
| `Indonesian` | `id` | インドネシア語 |

全件は `GET /tts/languages` と `extension/languages.json` にあります。

拡張の速度・音量・生成オプションは `extension/settings.json` に保存します。ポップアップで変えると、サーバーの `PUT /extension/settings` がこのファイルへ書き戻します。サーバー停止中は、拡張内の `settings.json` を読みます。

初回起動はモデル読み込みに時間がかかります。拡張や `test/test_client.html` を使う前に、サーバーを起動しておいてください。

## 5. Chrome 拡張の読み込み

1. Chrome で `chrome://extensions` を開く
2. 右上の「デベロッパーモード」をオンにする
3. 「パッケージ化されていない拡張機能を読み込む」
4. このリポジトリの `extension` フォルダを選ぶ

拡張を更新したあとは、拡張の再読み込みに加えて、読み上げ対象のページも再読み込みしてください。

## 6. 使い方

1. サーバーを起動する
2. 読み上げたいページを開く
3. ツールバーの OmniVoice Web Reader をクリックする

| 操作 | 内容 |
| --- | --- |
| 本文を抽出 | ページの記事本文だけを表示する |
| このページを読み上げる | 抽出した本文を順に読み上げる |
| 選択範囲を読み上げる | ページ上で選択したテキストだけを読み上げる |
| 一時停止 / 再開 / 停止 | 再生を制御する |
| 速度 / 音量 | 再生中でも変更できる |
| 生成設定 | `language` や `num_step` など、サーバーへ送る生成オプション |

ページ上でテキストを選択して右クリックし、「選択テキストを読み上げ」でも同じことができます。

読み上げ中は、現在の文がページ上で黄色くハイライトされ、見える位置までスクロールします。ポップアップを閉じても再生は続きます。

`language` の既定は `auto` です。本文から日本語／英語／中国語／韓国語を判定します。ほかの言語は生成設定の一覧から選びます。

文の切り方は次の順です。

1. 改行
2. `。．！？!?`、または英文の `.` のあと（次が大文字）
3. それでも長い行は読点
4. それでも長い行は 120 文字

## 7. ブラウザ単体のテスト UI

拡張を使わず、テキストを直接読み上げたい場合:

1. サーバーを起動する
2. `test/test_client.html` をブラウザで開く
3. 文章を入力して「読み上げ開始」

文分割だけを確認する場合:

```powershell
node test/test_sentence_split.mjs
```

## 8. 調査用ログ

読み上げが止まったように見えるときは、次を見ます。

| 場所 | 見られるもの |
| --- | --- |
| サーバー窓 | リクエスト ID、文字数、生成秒数、サンプル数 |
| Offscreen のコンソール | `[playback]` `[tts]` `[audio]` |
| service worker のコンソール | 抽出文字数・行数 |
| ページのコンソール | 抽出とハイライトの成否 |
| 拡張ポップアップ | 失敗時の「読み上げエラー」 |

Offscreen と service worker のコンソールは、`chrome://extensions` の拡張詳細から開けます。
