# ================================================================================
# python -m server
#
# ローカル TTS サーバーを起動する。
# HOST / PORT は既定のまま、起動引数 --host / --port で上書きできる。
# ================================================================================

import argparse
import socket

import uvicorn

from server.config import HOST, PORT


def parse_args():
    parser = argparse.ArgumentParser(
        description="OmniVoice ローカル TTS サーバーを起動する。",
    )
    parser.add_argument(
        "--host",
        default=HOST,
        help=f"待ち受けホスト（既定: {HOST}）",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=PORT,
        help=f"待ち受けポート（既定: {PORT}）",
    )
    return parser.parse_args()


# ================================================================================
# ensure_port_available
# 待ち受けポートが空いていることを確認する。
# ================================================================================
def ensure_port_available(host, port):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

    try:
        sock.bind((host, port))
    except OSError:
        print()
        print(f"{port} 番ポートは既に使われています。")
        print("前のサーバーを閉じてから、もう一度起動してください。")
        print(f"例: netstat -ano | findstr :{port}")
        raise SystemExit(1)
    finally:
        sock.close()


args = parse_args()
host = args.host
port = args.port

print()
print("=" * 60)
print(f"Server starting: http://{host}:{port}")
print("=" * 60)
print()

ensure_port_available(host, port)

from server.app import app

uvicorn.run(
    app,
    host=host,
    port=port,
)

# ================================================================================
