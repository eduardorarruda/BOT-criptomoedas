"""Servidor local do site (só para conferir): como as hospedagens estáticas, responde 404.html ao que não existe.

uso: python3 servir.py [porta]   (padrão 5199, preso em 127.0.0.1)
"""

import http.server
import sys
from pathlib import Path

PASTA = Path(__file__).resolve().parent


class Site(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PASTA), **kwargs)

    def send_error(self, code, message=None, explain=None):
        pagina = PASTA / "404.html"
        if code != 404 or not pagina.exists():
            return super().send_error(code, message, explain)
        corpo = pagina.read_bytes()
        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(corpo)


if __name__ == "__main__":
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else 5199
    http.server.ThreadingHTTPServer(("127.0.0.1", porta), Site).serve_forever()
