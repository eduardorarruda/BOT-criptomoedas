"""Coletor do MetaTrader 5 (só leitura de dados) para o ZenTrade.

Fala com o terminal MT5 (container `mt5-terminal`, Wine + servidor RPyC) pela biblioteca
`mt5linux`, que replica a API oficial `MetaTrader5` do PyPI, e expõe uma API HTTP mínima
**só na rede interna do compose** (nenhuma porta é publicada no host):

    GET  /saude
    POST /simbolos  {conta, padrao}                       -> {simbolos}
    POST /coletar   {conta, simbolo, intervalo, de, ate}  -> {barras}

`conta` = {servidor, login, senha} da conta DEMO; chega a cada pedido, é usada para abrir a
sessão e nunca é gravada nem escrita em log. Este arquivo NÃO usa order_send nem qualquer
função de ordem: o conector só lê dados.
"""

from __future__ import annotations

import json
import os
import re
import threading
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MT5_HOST = os.environ.get("MT5_RPYC_HOST", "mt5-terminal")
MT5_PORTA = int(os.environ.get("MT5_RPYC_PORTA", "8001"))
PORTA = int(os.environ.get("COLETOR_PORTA", "8090"))
LIMITE_CORPO = 16 * 1024
JANELA_MAXIMA_DIAS = 40
SIMBOLO = re.compile(r"^[A-Za-z0-9$@._-]{1,20}$")
PADRAO = re.compile(r"^[A-Za-z0-9$@._*-]{1,20}$")
DIA_MS = 86_400_000

# Um terminal, uma sessão por vez.
_trava = threading.Lock()


class ErroPedido(Exception):
    def __init__(self, status: int, mensagem: str):
        super().__init__(mensagem)
        self.status = status


def _conta(corpo: dict) -> dict:
    c = corpo.get("conta")
    if not isinstance(c, dict):
        raise ErroPedido(400, "falta a conta")
    servidor, login, senha = c.get("servidor"), c.get("login"), c.get("senha")
    if not (isinstance(servidor, str) and isinstance(senha, str) and servidor and senha):
        raise ErroPedido(400, "conta incompleta")
    if not (isinstance(login, str) and login.isdigit()):
        raise ErroPedido(400, "o login do MT5 é um número")
    return {"servidor": servidor, "login": int(login), "senha": senha}


def _abrir():
    from mt5linux import MetaTrader5  # importado aqui: a checagem de sintaxe não precisa do pacote

    return MetaTrader5(host=MT5_HOST, port=MT5_PORTA)


def _sessao(mt5, conta: dict) -> None:
    if not mt5.initialize(login=conta["login"], password=conta["senha"], server=conta["servidor"]):
        # Nada do que o MT5 devolve é repassado cru: a mensagem dele pode repetir a senha.
        raise ErroPedido(502, f"o MetaTrader 5 recusou o login (código {mt5.last_error()[0]})")


def simbolos(corpo: dict) -> dict:
    conta = _conta(corpo)
    padrao = corpo.get("padrao", "WIN*")
    if not (isinstance(padrao, str) and PADRAO.match(padrao)):
        raise ErroPedido(400, "padrão de símbolo inválido")
    with _trava:
        mt5 = _abrir()
        try:
            _sessao(mt5, conta)
            achados = mt5.symbols_get(padrao) or []
            return {"simbolos": sorted(s.name for s in achados)}
        finally:
            mt5.shutdown()


def _meia_noite(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


def coletar(corpo: dict) -> dict:
    conta = _conta(corpo)
    simbolo, de, ate = corpo.get("simbolo"), corpo.get("de"), corpo.get("ate")
    if not (isinstance(simbolo, str) and SIMBOLO.match(simbolo)):
        raise ErroPedido(400, "símbolo inválido")
    if corpo.get("intervalo") != "5m":
        raise ErroPedido(400, "só o intervalo 5m")
    if not (isinstance(de, int) and isinstance(ate, int) and 0 < de < ate):
        raise ErroPedido(400, "período inválido (ms UTC)")
    if ate - de > JANELA_MAXIMA_DIAS * DIA_MS:
        raise ErroPedido(400, f"período maior que {JANELA_MAXIMA_DIAS} dias")
    # Não sabemos o fuso do servidor: pedimos dias inteiros com folga de um dia para cada
    # lado (limites à meia-noite) e o motor recorta depois de converter para UTC.
    inicio = _meia_noite(de) - timedelta(days=1)
    fim = _meia_noite(ate) + timedelta(days=2)
    with _trava:
        mt5 = _abrir()
        try:
            _sessao(mt5, conta)
            if not mt5.symbol_select(simbolo, True):
                raise ErroPedido(404, f"a corretora não tem o símbolo {simbolo}")
            linhas = mt5.copy_rates_range(simbolo, mt5.TIMEFRAME_M5, inicio, fim)
            if linhas is None:
                raise ErroPedido(502, f"o MetaTrader 5 não devolveu barras (código {mt5.last_error()[0]})")
            return {
                "barras": [
                    {
                        # Hora do relógio do servidor, como época Unix (os dígitos são os do servidor).
                        "tempoServidorNaive": int(r["time"]) * 1000,
                        "abre": repr(float(r["open"])),
                        "maxima": repr(float(r["high"])),
                        "minima": repr(float(r["low"])),
                        "fecha": repr(float(r["close"])),
                        # Contratos negociados; sem esse dado, o volume de ticks.
                        "volume": str(int(r["real_volume"]) or int(r["tick_volume"])),
                    }
                    for r in linhas
                ]
            }
        finally:
            mt5.shutdown()


ROTAS = {"/simbolos": simbolos, "/coletar": coletar}


class Manipulador(BaseHTTPRequestHandler):
    server_version = "coletor-mt5"

    def _responder(self, status: int, corpo: dict) -> None:
        dados = json.dumps(corpo).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/saude":
            self._responder(200, {"ok": True})
        else:
            self._responder(404, {"erro": "rota inexistente"})

    def do_POST(self) -> None:  # noqa: N802
        rota = ROTAS.get(self.path)
        if rota is None:
            return self._responder(404, {"erro": "rota inexistente"})
        try:
            tamanho = int(self.headers.get("content-length", "0"))
            if not 0 < tamanho <= LIMITE_CORPO:
                raise ErroPedido(413, "corpo ausente ou grande demais")
            corpo = json.loads(self.rfile.read(tamanho))
            if not isinstance(corpo, dict):
                raise ErroPedido(400, "o corpo precisa ser um objeto JSON")
            self._responder(200, rota(corpo))
        except ErroPedido as e:
            self._responder(e.status, {"erro": str(e)})
        except json.JSONDecodeError:
            self._responder(400, {"erro": "JSON inválido"})
        except Exception:  # noqa: BLE001 - nunca devolver (nem logar) o que pode conter a senha
            self._responder(502, {"erro": "falha ao falar com o MetaTrader 5"})

    def log_message(self, formato: str, *args) -> None:  # sem log de acesso: o corpo tem a conta
        return


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORTA), Manipulador).serve_forever()
