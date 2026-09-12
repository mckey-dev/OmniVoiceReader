# ================================================================================
# miopen_log.py
#
# MIOpen の IsEnoughWorkspace 警告を 1 行にまとめる。
# Loading weights は tqdm のバーを、同じ 1 行の上で更新する。
# Windows では fd を差し替えず、Python の stderr だけを見る。
# ================================================================================

import atexit
import os
import re
import sys
import threading


_WARNING_MARK = "MIOpen: Warning [IsEnoughWorkspace]"
_WORKSPACE_RE = re.compile(r"workspace required:\s*(\d+)")

_orig_stream = None
_filter_stream = None
_write_lock = threading.Lock()
_state_lock = threading.Lock()
_flushing = False
_count = 0
_max_workspace = 0
_flush_timer = None
_installed = False


# ================================================================================
# configure_stdio
# Windows のコンソールを UTF-8 にし、日本語の print が化けないようにする。
# ================================================================================
def configure_stdio():
    if sys.platform == "win32":
        try:
            import ctypes

            kernel32 = ctypes.windll.kernel32
            kernel32.SetConsoleOutputCP(65001)
            kernel32.SetConsoleCP(65001)
        except Exception:
            pass

    encoding = "utf-8"

    for name in ("stdout", "stderr", "__stdout__", "__stderr__"):
        stream = getattr(sys, name, None)

        if stream is None or not hasattr(stream, "reconfigure"):
            continue

        try:
            stream.reconfigure(encoding=encoding, errors="replace")
        except Exception:
            pass

    return encoding


# ================================================================================
# _write_orig
# 元の stderr へ、そのまま書き出す。
# ================================================================================
def _write_orig(text):
    if not text:
        return

    stream = _orig_stream or sys.__stderr__

    with _write_lock:
        if stream is None:
            return

        try:
            stream.write(text)
            stream.flush()
        except Exception:
            pass


# ================================================================================
# _drain_filter_buffer
# 未完了の stderr バッファを確定する。
# ================================================================================
def _drain_filter_buffer():
    stream = _filter_stream

    if stream is None or not stream._buf:
        return

    leftover = stream._buf
    stream._buf = ""

    if leftover.strip():
        _handle_line(leftover)


# ================================================================================
# _record_warning
# MIOpen 警告なら溜めて True を返す。
# ================================================================================
def _record_warning(line):
    global _count, _max_workspace

    if "\r" in line:
        line = line.rsplit("\r", 1)[-1]

    if _WARNING_MARK not in line:
        return False

    match = _WORKSPACE_RE.search(line)

    with _state_lock:
        _count += 1

        if match:
            _max_workspace = max(_max_workspace, int(match.group(1)))

    return True


# ================================================================================
# _emit_pending
# 溜めた MIOpen 警告を 1 行出す。
# ================================================================================
def _emit_pending():
    global _count, _max_workspace, _flush_timer

    with _state_lock:
        if _flush_timer is not None:
            _flush_timer.cancel()
            _flush_timer = None

        count = _count
        max_workspace = _max_workspace
        _count = 0
        _max_workspace = 0

    if count <= 0:
        return

    if count == 1:
        _write_orig(
            f"{_WARNING_MARK} Solver <GemmFwdRest>, "
            f"workspace required: {max_workspace}\n"
        )
        return

    _write_orig(
        f"{_WARNING_MARK} Solver <GemmFwdRest> "
        f"x{count} (workspace max {max_workspace})\n"
    )


# ================================================================================
# flush_miopen_warnings
# 溜めた MIOpen 警告をまとめて出す。
# ================================================================================
def flush_miopen_warnings():
    global _flushing

    if _flushing:
        return

    _flushing = True

    try:
        _drain_filter_buffer()
        _emit_pending()
    finally:
        _flushing = False


# ================================================================================
# _schedule_flush
# 警告の連打が止まったら、まとめて 1 行出す。
# ================================================================================
def _schedule_flush():
    global _flush_timer

    with _state_lock:
        if _flush_timer is not None:
            _flush_timer.cancel()

        _flush_timer = threading.Timer(0.3, flush_miopen_warnings)
        _flush_timer.daemon = True
        _flush_timer.start()


# ================================================================================
# _handle_line
# 確定した 1 行を処理する。
# ================================================================================
def _handle_line(line):
    if _record_warning(line):
        _schedule_flush()
        return

    if not _flushing:
        flush_miopen_warnings()

    if "\r" in line:
        line = line.rsplit("\r", 1)[-1]

    text = line.rstrip("\n")

    # tqdm の確定行は、直前の \r 更新と同じ内容なので
    # もう一度末尾に足さず、同じ行を上書きして改行する。
    if text.startswith("Loading weights:"):
        _write_orig("\r" + text + "\n")
        return

    _write_orig(text + "\n")


# ================================================================================
# _FilterStderr
# tqdm の \r 更新はそのまま通し、改行済みの行だけを見る。
# isatty は True にして、tqdm が毎回改行しないようにする。
# ================================================================================
class _FilterStderr:
    def __init__(self, wrapped):
        self._wrapped = wrapped
        self._buf = ""

    def write(self, text):
        if not text:
            return 0

        if not isinstance(text, str):
            text = str(text)

        self._buf += text

        while "\n" in self._buf:
            line, self._buf = self._buf.split("\n", 1)
            _handle_line(line + "\n")

        if "\r" in self._buf:
            current = self._buf.rsplit("\r", 1)[-1]
            self._buf = current

            if current and not _record_warning(current):
                _write_orig("\r" + current)

        return len(text)

    def flush(self):
        try:
            self._wrapped.flush()
        except Exception:
            pass

    def isatty(self):
        return True

    def __getattr__(self, name):
        return getattr(self._wrapped, name)


# ================================================================================
# install_miopen_log_filter
# C++ の警告はログレベルで抑え、Python の stderr だけをまとめる。
# ================================================================================
def install_miopen_log_filter():
    global _orig_stream, _filter_stream, _installed

    if _installed:
        return

    configure_stdio()
    os.environ.setdefault("MIOPEN_LOG_LEVEL", "3")

    _orig_stream = sys.stderr
    _filter_stream = _FilterStderr(_orig_stream)
    sys.stderr = _filter_stream
    _installed = True

    atexit.register(flush_miopen_warnings)

# ================================================================================
