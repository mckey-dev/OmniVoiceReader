# OmniVoice Reader

Version: **v2.0.0**  
更新日: 2026-09-16

ローカルの OmniVoice TTS と Chrome 拡張で、Web ページの日本語を読み上げるプロジェクトです。

- サーバー: 手元の GPU（AMD ROCm / NVIDIA CUDA）または CPU で音声を生成する
- 拡張: ツールバーから操作ウィンドウを開き、ページ本文または選択テキストを読み上げる
- 再生中は、操作ウィンドウに現在の文を出す。ページ上のハイライトは設定でオンにできる
- ChatGPT / Gemini では、完成した解答を自動で読む設定がある（既定はオフ）
- 声は操作ウィンドウの「声」から登録した参照音声（wav / mp3 / ogg など）でクローンする

開発環境では、以下の GPU で行いました。

- NVIDIA GeForce RTX 2060 SUPER（推奨。`start_cuda.bat`）
- AMD Radeon 780M / gfx1103 + ROCm 10（`start_amd.bat`）

開発環境の NVIDIA ドライバは 616.92（CUDA 13.4）です。CUDA で動かす場合は `start_cuda.bat` を使います。

## ブランチ運用

| ブランチ | 用途 |
| --- | --- |
| `main` | 安定版。現在の固定リリースは **v1.0.0** |
| `dev` | 開発中。現在の作業版は **v2.0.0** |

新しい機能は `dev` で進め、安定したら `main` へ取り込み、必要に応じてバージョンタグを付けます。

## 必要なもの

- Windows（Linux 用の起動スクリプトもあります）
- Python 3.12 相当
- Google Chrome
- GPU を使う場合は、対応する PyTorch（ROCm または CUDA）
- 声クローン用の参照音声（wav / mp3 / ogg など。拡張の「声」から登録。書き起こしは無ければ自動作成）

## ディレクトリの見取り

| パス | 内容 |
| --- | --- |
| `server/` | ローカル TTS サーバー（`python -m server` → `http://127.0.0.1:8000`） |
| `server/sampling/` | 参照音声の変換と声クローン用プロンプトの作成 |
| `extension/` | Chrome 拡張（MV3） |
| `extension/settings.json` | 再生速度・音量・ハイライト／チャット自動・生成オプション |
| `models/OmniVoice` | TTS モデル。無ければ起動時にダウンロード |
| `models/whisper-large-v3-turbo` | 参照音声の書き起こし用 |
| `voice/` | 登録した声（元ファイル・wav・txt・プロンプト） |
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
| `models/whisper-large-v3-turbo` | 参照音声の書き起こし用。無ければ書き起こし時にダウンロード |

## 3. 声クローン

参照音声は操作ウィンドウの「声」からアップロードします。サーバーは声が無くても起動します。読み上げの前に、少なくとも 1 件を登録して選んでください。アップロード中もこのウィンドウは開いたままです。

以前の `voice/sample.wav` / `sample.txt` / `voice_clone_prompt.pt` は、初回起動時に 1 件の声フォルダへ移します。

保存先は `voice/{id}/` です。アップロード名 `自分の声.mp3` なら、同じ stem で中間ファイルも残します。

```
voice/{id}/
  自分の声.mp3
  自分の声.wav
  自分の声.txt
  自分の声.pt
```

元が WAV なら変換コピーは作りません。次に同じ声を選んだときは、保存済みの `.pt` を読むだけで書き起こしからやり直しません。消すときは拡張の削除だけです。

手動でプロンプトだけ作り直す場合:

```powershell
.\venv_amd\Scripts\Activate.ps1
python -m server.sampling.build_voice_prompt
```

書き起こし `{stem}.txt` が無ければ Whisper で作ります。WAV / OGG / FLAC は `soundfile`、MP3 は `miniaudio` で読むので ffmpeg は不要です。既にある txt は手修正を優先します。

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
| `POST /tts` | 読み上げ。本文は `{"text": "こんにちは。"}`。声が未選択なら 409 |
| http://127.0.0.1:8000/tts/defaults | 生成オプションの既定値 |
| http://127.0.0.1:8000/tts/languages | OmniVoice が受け付ける language 一覧 |
| http://127.0.0.1:8000/extension/settings | 拡張設定の読み書き |
| http://127.0.0.1:8000/voices | 声の一覧・追加・選択・削除 |

`POST /tts` で省略できる項目と、サーバー既定値は次のとおりです。

| 項目 | 既定 |
| --- | --- |
| `instruct` | 空（未指定。下の「instruct の書き方」を参照） |
| `language` | `auto`（本文から判定。下の「language の選び方」を参照） |
| `speed` | 1.0（下の「speed の意味」を参照） |
| `num_step` | 32 |
| `guidance_scale` | 2.0 |
| `t_shift` | 0.1 |
| `position_temperature` | 5.0 |
| `class_temperature` | 0.0 |
| `denoise` | true |

既定値は `server/app.py` の `DEFAULT_*` で変えます。操作ウィンドウの「生成設定」と `test/test_client.html` からも同じ項目を送れます。

操作ウィンドウ上部の「速度」は、生成済み音声の再生速度です。生成時の話す速さは `speed` です。

### speed の意味

`speed` は OmniVoice が音声を作るときの話す速さです。再生用の「速度」スライダーとは別です。

| 値 | 効果 |
| --- | --- |
| `1.0` | 既定 |
| `1` より大きい | 短く、速く話す |
| `1` より小さい | 長く、遅く話す |

例: `0.8` はゆっくり、`1.2` は速めです。

### instruct の書き方

`instruct` は自由文ではありません。OmniVoice 0.2.1 が認めるタグだけを、カンマで並べます。空、または未指定なら声クローンだけが使われます。

このプロジェクトは常に、拡張で選んだ声のクローンを使います。`instruct` を入れると、その声の上に性別・年齢・音高・スタイル・口音／方言の指定が乗ります。リストに無い語（`happy` や「ゆっくりめに」など）は `ValueError` になります。

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

OmniVoice 0.2.1 は **646 言語** を受け付けます。操作ウィンドウと `test/test_client.html` の language から選べます。検索欄に `ja` や `日本語`、`French` などを入れると絞り込めます。

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

拡張の再生速度・音量・ハイライト／チャット自動・生成オプションは `extension/settings.json` に保存します。操作ウィンドウで変えると、サーバーの `PUT /extension/settings` がこのファイルへ書き戻します。サーバー停止中は、拡張内の `settings.json` を読みます。

初回起動はモデル読み込みに時間がかかります。拡張や `test/test_client.html` を使う前に、サーバーを起動しておいてください。

## 5. Chrome 拡張の読み込み

1. Chrome で `chrome://extensions` を開く
2. 右上の「デベロッパーモード」をオンにする
3. 「パッケージ化されていない拡張機能を読み込む」
4. このリポジトリの `extension` フォルダを選ぶ

ツールバーの OmniVoice Web Reader をクリックすると、操作ウィンドウが開きます（ツールバー下の小さなポップアップではありません）。位置は、直前のマウス位置に近いところです。ページをクリックしてもこの窓は閉じません。すでに開いていれば、その窓を前面へ出します。

拡張を更新したあとは、拡張の再読み込みに加えて、読み上げ対象のページも再読み込みしてください。

主なファイル:

| パス | 内容 |
| --- | --- |
| `background.js` | service worker（ES module）。読み上げ開始とメッセージ中継 |
| `extension_settings.js` | `settings.json` の読み書きと、ページへの設定配信 |
| `reader_window.js` | 操作ウィンドウの位置と開閉 |
| `popup.js` | 操作ウィンドウ。抽出・再生・生成設定・進捗 |
| `voices_ui.js` | 操作ウィンドウの声一覧・選択・削除・アップロード |
| `language_ui.js` | language の検索付き選択。`test/test_client.html` でも使う |
| `content.js` | 本文・選択テキストの抽出と、ページ上の文ハイライト |
| `chat_auto.js` | ChatGPT / Gemini の解答完成を監視する |
| `offscreen.js` | 音声再生用 Offscreen。`playback.js` / `tts.js` / `audio.js` を読む |

## 6. 使い方

1. サーバーを起動する
2. 読み上げたいページを開く
3. ツールバーの OmniVoice Web Reader をクリックして操作ウィンドウを開く

| 操作 | 内容 |
| --- | --- |
| 本文を抽出 | ページの記事本文だけを表示する |
| このページを読み上げる | 抽出した本文を順に読み上げる |
| 選択範囲を読み上げる | ページ上で選択したテキストだけを読み上げる |
| 一時停止 / 再開 / 停止 | 再生を制御する |
| 速度 / 音量 | 再生側。生成済み音声の再生速度と音量。再生中でも変更できる |
| 読み上げ中の文をハイライト | ページ上で現在の文を黄色く囲む。既定はオフ |
| チャットの解答を自動で読む | ChatGPT / Gemini で、オンにしたあとに完成した解答を読む。既定はオフ |
| 声 | 参照音声のアップロード・選択・削除 |
| 生成設定 | `language`、`speed`、`num_step` など、サーバーへ送る生成オプション |

ページ上でテキストを選択して右クリックし、「選択テキストを読み上げ」でも同じことができます。

読み上げ中は、操作ウィンドウに現在の文が出ます。ページ上の黄色いハイライトは、設定でオンにしたときだけです。操作ウィンドウを閉じても再生は続きます。

「チャットの解答を自動で読む」は `chatgpt.com` / `chat.openai.com` / `gemini.google.com` だけです。オンにした時点ですでに画面にあるログは読まず、そのあと完成したアシスタント解答だけを読みます。生成中は待って、テキストが止まってから開始します。コードブロックは除きます。次の解答が完成したら、いま読んでいるものを止めて切り替えます。ハイライト設定とは独立です。

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
| service worker のコンソール | 抽出文字数・行数（`background.js`） |
| ページのコンソール | 抽出とハイライトの成否。チャット自動は `chat_auto.js` |
| 操作ウィンドウ | 失敗時の「読み上げエラー」 |

Offscreen と service worker のコンソールは、`chrome://extensions` の拡張詳細から開けます。
