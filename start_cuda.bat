@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

rem venv_cuda + requirements_cuda.txt

set "VENV_DIR=venv_cuda"
set "REQ_FILE=requirements_cuda.txt"
set "REQ_HINT=CUDA 版が環境と合わない場合は、cu126 / cu130 / cu132 を確認してください。"
set "PYTHON_EXE=%VENV_DIR%\Scripts\python.exe"
set "PY="

where py >nul 2>&1
if errorlevel 1 goto TRY_PYTHON
set "PY=py -3"
goto HAVE_PY

:TRY_PYTHON
where python >nul 2>&1
if errorlevel 1 goto NO_PYTHON
set "PY=python"
goto HAVE_PY

:NO_PYTHON
echo Python が見つかりません。Python 3 をインストールしてください。
exit /b 1

:HAVE_PY
echo NVIDIA ドライバを確認しています...
%PY% -m server.gpu_runtime
if errorlevel 1 goto DRIVER_FAIL
if exist "%PYTHON_EXE%" goto HAVE_VENV
echo 仮想環境を作成しています: %VENV_DIR%
%PY% -m venv "%VENV_DIR%"
if errorlevel 1 goto VENV_FAIL
echo pip を更新しています...
"%PYTHON_EXE%" -m pip install -U pip
if errorlevel 1 goto PIP_FAIL
echo 必要なパッケージをインストールしています: %REQ_FILE%
echo 既定は torch の CUDA 13.0 版 (cu130) です。
"%PYTHON_EXE%" -m pip install -r %REQ_FILE%
if errorlevel 1 goto REQ_FAIL

:HAVE_VENV
"%PYTHON_EXE%" -c "from server.sampling.sample_audio import ensure_sample_wav; ensure_sample_wav()"
if errorlevel 1 goto NO_SAMPLE
if exist "voice\voice_clone_prompt.pt" goto START_SERVER
echo voice\voice_clone_prompt.pt が無いため、参照音声から作成します...
"%PYTHON_EXE%" -m server.sampling.build_voice_prompt
if errorlevel 1 goto PROMPT_FAIL
goto START_SERVER

:NO_SAMPLE
echo 参照音声の準備に失敗しました。
echo voice フォルダに sample.wav / sample.mp3 / sample.ogg などを置いてから再実行してください。
exit /b 1

:NO_PROMPT
echo voice\voice_clone_prompt.pt が見つかりません。
echo voice フォルダに sample.wav / sample.mp3 / sample.ogg などを置いてから再実行してください。
exit /b 1

:PROMPT_FAIL
echo 声クローン用プロンプトの作成に失敗しました。
exit /b 1

:VENV_FAIL
echo 仮想環境の作成に失敗しました。
exit /b 1

:PIP_FAIL
echo pip の更新に失敗しました。
exit /b 1

:DRIVER_FAIL
echo NVIDIA ドライバの確認に失敗しました。
exit /b 1

:REQ_FAIL
echo %REQ_FILE% からのインストールに失敗しました。
if defined REQ_HINT echo %REQ_HINT%
exit /b 1

:START_SERVER
echo サーバーを起動します: http://127.0.0.1:8000
"%PYTHON_EXE%" -m server
exit /b %ERRORLEVEL%
