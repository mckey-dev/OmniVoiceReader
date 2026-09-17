# ================================================================================
# config.py
#
# サーバーの定数。HOST / PORT は python -m server --host / --port で上書きできる。
# ================================================================================

import os

from server.paths import PROJECT_ROOT


APP_VERSION = "2.0.0"
SETTINGS_FILE = os.path.join(PROJECT_ROOT, "extension", "settings.json")
MAX_VOICE_UPLOAD_BYTES = 20 * 1024 * 1024

HOST = "127.0.0.1"
PORT = 8000

DEFAULT_NUM_STEP = 32
DEFAULT_GUIDANCE_SCALE = 2.0
DEFAULT_SPEED = 1.0
DEFAULT_T_SHIFT = 0.1
DEFAULT_POSITION_TEMPERATURE = 5.0
DEFAULT_CLASS_TEMPERATURE = 0.0
DEFAULT_DENOISE = True
DEFAULT_INSTRUCT = ""


# ================================================================================
