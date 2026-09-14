# ================================================================================
# python -m server
#
# ローカル TTS サーバーを起動する。
# ================================================================================

import uvicorn

from server.app import HOST, PORT, app, ensure_port_available


print()
print("=" * 60)
print(f"Server starting: http://{HOST}:{PORT}")
print("=" * 60)
print()

ensure_port_available(HOST, PORT)

uvicorn.run(
    app,
    host=HOST,
    port=PORT,
)

# ================================================================================
