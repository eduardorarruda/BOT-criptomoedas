#!/usr/bin/env bash
# Laço do pregão de papel do WIN. A cada 5 minutos, de segunda a sexta, das 09:05 às 18:45
# (Brasília):
#   1. garante o MT5 da corretora aberto com o script ZenTradeWINVivo (que grava as velas
#      fechadas do WIN$N em MQL5/Files/WIN_M5_vivo.csv);
#   2. importa essas velas no banco (importar-candles-csv; regravar não duplica);
#   3. roda o pregao.mjs (todas as estratégias, com e sem Claude) e atualiza saida/<dia>.md.
# Uso: bash pesquisa/win-papel/rodar.sh [--uma-vez]
set -u

AQUI="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$AQUI/../.." && pwd)"
MT5="$HOME/.mt5/drive_c/Program Files/Rico - MetaTrader 5"
ENV_ZT="$HOME/.config/zentrade/local.env"
LOG="$AQUI/saida/laco.log"
mkdir -p "$AQUI/saida" "$AQUI/vivo"

registrar() { echo "$(date '+%F %T') $*" >> "$LOG"; }

# O MT5 da Rico está aberto? Pela pasta do processo: o MT5 genérico também roda
# terminal64.exe, e procurar o nome na linha de comando casa com o shell que chamou o pgrep.
mt5_da_rico_aberto() {
  local p
  for p in $(pgrep -f terminal64); do
    readlink "/proc/$p/cwd" 2>/dev/null | grep -q 'Rico - MetaTrader 5' && return 0
  done
  return 1
}

garantir_mt5() {
  if mt5_da_rico_aberto; then return; fi
  registrar "MT5 fechado: abrindo com o script ao vivo"
  (cd "$MT5" && env WINEPREFIX="$HOME/.mt5" WINEDEBUG=-all nohup wine terminal64.exe \
    '/config:C:\Program Files\Rico - MetaTrader 5\Config\zentrade-vivo.ini' > /dev/null 2>&1 &)
  sleep 60
}

usuario() {
  docker exec zentrade-banco-1 sh -c \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select usuario_id from robos limit 1"'
}

uma_rodada() {
  garantir_mt5
  local csv="$MT5/MQL5/Files/WIN_M5_vivo.csv"
  if [ ! -s "$csv" ]; then
    registrar "sem $csv ainda (o script do MT5 grava na primeira vela fechada)"
    return
  fi
  cp "$csv" "$AQUI/vivo/WIN_M5_vivo.csv"
  registrar "status MT5: $(tr -d '\r' < "$MT5/MQL5/Files/WIN_M5_vivo.status" 2>/dev/null)"
  local saida
  saida=$(cd "$REPO/infra" && timeout 900 docker compose -p zentrade --env-file "$ENV_ZT" --profile app \
    run --rm --no-deps -T -e WIN_PAPEL_USUARIO="$(usuario)" -v "$AQUI:/app/pesquisa-win" motor sh -c \
    'node dist/comandos/importar-candles-csv.js --simbolo WIN --intervalo 5m --arquivo /app/pesquisa-win/vivo/WIN_M5_vivo.csv | tail -2 && node /app/pesquisa-win/pregao.mjs' 2>&1 | grep -v -E '^ Container ')
  registrar "$(echo "$saida" | tr '\n' ' ')"
}

no_pregao() {
  local dia hora
  dia=$(TZ=America/Sao_Paulo date +%u)
  hora=$(TZ=America/Sao_Paulo date +%H%M)
  [ "$dia" -le 5 ] && [ "$hora" -ge 0905 ] && [ "$hora" -le 1845 ]
}

if [ "${1:-}" = "--uma-vez" ]; then
  uma_rodada
  exit 0
fi

registrar "laço iniciado"
while true; do
  if no_pregao; then uma_rodada; fi
  # acorda 40 s depois da próxima vela de 5 minutos (dá tempo do MT5 gravar a vela fechada)
  agora=$(date +%s)
  sleep $(( 300 - agora % 300 + 40 ))
done
