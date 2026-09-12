# OmniVoice Reader

更新日: 2026-09-13

ローカルの OmniVoice TTS と Chrome 拡張で、Web ページの日本語を読み上げるプロジェクトです。

- サーバー: 手元の GPU（AMD ROCm / NVIDIA CUDA）または CPU で音声を生成する
- 拡張: ページ本文、または選択したテキストだけを読み上げる
- 再生中は、現在の文をページ上でハイライトする
- 声は `sample.wav` から作ったクローン用プロンプトを使う

この環境での動作確認は、AMD Radeon 780M（gfx1103）+ ROCm 10 です。

## 必要なもの

- Windows（Linux 用の起動スクリプトもあります）
- Python 3.12 相当
- Google Chrome
- GPU を使う場合は、対応する PyTorch（ROCm または CUDA）
- 声クローン用の参照音声 `sample.wav`（書き起こし `sample.txt` は無ければ自動作成）

## ディレクトリの見取り

| パス | 内容 |
| --- | --- |
| `server.py` | ローカル TTS サーバー（`http://127.0.0.1:8000`） |
| `extension/` | Chrome 拡張（MV3） |
| `extension/settings.json` | 速度・音量・生成オプション |
| `models/OmniVoice` | TTS モデル。無ければ起動時にダウンロード |
| `models/whisper-large-v3-turbo` | `sample.txt` 自動作成用 |
| `voice_clone_prompt.pt` | 声クローン用プロンプト |
| `test_client.html` | 拡張を使わないブラウザ単体の試験 UI |
| `test_sentence_split.mjs` | 文分割の確認用 |

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
| `models/whisper-large-v3-turbo` | `sample.txt` 自動作成用。無ければ書き起こし時にダウンロード |

## 3. 声クローン用プロンプト

`sample.wav` が無いと、サーバーは起動しません。起動スクリプトも同じ条件で止まります。

サーバーは起動時に `voice_clone_prompt.pt` を読み込みます。このファイルが無くて `sample.wav` がある場合、起動スクリプトが自動で作成します。

手動で作る場合:

```powershell
.\venv_amd\Scripts\Activate.ps1
python test_voice_prompt_save_load.py
```

`sample.txt` が無ければ Whisper で書き起こします。既にある `sample.txt` は、手修正した内容を優先します。

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
python server.py
```

起動後:

| URL | 内容 |
| --- | --- |
| http://127.0.0.1:8000/ | 稼働確認 |
| http://127.0.0.1:8000/health | ヘルスチェック |
| `POST /tts` | 読み上げ。本文は `{"text": "こんにちは。"}` |
| http://127.0.0.1:8000/tts/defaults | 生成オプションの既定値 |
| http://127.0.0.1:8000/extension/settings | 拡張設定の読み書き |

`POST /tts` で省略できる項目と、サーバー既定値は次のとおりです。

| 項目 | 既定 |
| --- | --- |
| `instruct` | 空 |
| `num_step` | 32 |
| `guidance_scale` | 2.0 |
| `t_shift` | 0.1 |
| `position_temperature` | 5.0 |
| `class_temperature` | 0.0 |
| `denoise` | true |

既定値は `server.py` の `DEFAULT_*` で変えます。拡張ポップアップの「生成設定」と `test_client.html` からも同じ項目を送れます。

拡張の速度・音量・生成オプションは `extension/settings.json` に保存します。ポップアップで変えると、サーバーの `PUT /extension/settings` がこのファイルへ書き戻します。サーバー停止中は、拡張内の `settings.json` を読みます。

初回起動はモデル読み込みに時間がかかります。拡張や `test_client.html` を使う前に、サーバーを起動しておいてください。

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
| 生成設定 | `num_step` など、サーバーへ送る生成オプション |

ページ上でテキストを選択して右クリックし、「選択テキストを読み上げ」でも同じことができます。

読み上げ中は、現在の文がページ上で黄色くハイライトされ、見える位置までスクロールします。ポップアップを閉じても再生は続きます。

文の切り方は次の順です。

1. 改行
2. `。．！？!?`
3. それでも長い行は読点
4. それでも長い行は 120 文字

## 7. ブラウザ単体のテスト UI

拡張を使わず、テキストを直接読み上げたい場合:

1. サーバーを起動する
2. `test_client.html` をブラウザで開く
3. 文章を入力して「読み上げ開始」

文分割だけを確認する場合:

```powershell
node test_sentence_split.mjs
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

## トラブルシュート

- `8000 番ポートは既に使われています`: 前の `server.py` が残っています。閉じてから再起動してください
- `sample.wav が見つかりません`: リポジトリ直下に参照音声 `sample.wav` を置いてから再起動する
- `Voice clone prompt not found`: `sample.wav` を置いて起動スクリプトを再実行するか、`test_voice_prompt_save_load.py` で `voice_clone_prompt.pt` を作る
- 拡張で「TTS request failed」: `server.py` が起動しているか、`http://127.0.0.1:8000/health` を確認する
- 選択範囲を読み上げできない: 先にページ上でテキストを選択する。ポップアップを開くと選択表示が消えても、直前の選択は保持される。それでも失敗する場合は右クリックの「選択テキストを読み上げ」を使う
- ハイライトされない: ページ側の DOM 分割や動的描画で、抽出テキストと表示テキストが一致していないことがある。その場合でも音声は再生される
- 長い文章が 1 リクエストになって止まったように見える: 句点や改行が少ないと、以前は 1 本の長い生成になっていました。今は 120 文字までで切ります
- 拡張を更新したあとに反応しない: `chrome://extensions` で再読み込みし、対象タブも再読み込みする
