#!/usr/bin/env bash
# Derruba os containers de teste criados por subir.sh.
set -euo pipefail
PREFIXO="${ZT_TESTE_PREFIXO:-zt-teste}"
docker rm -f -v "$PREFIXO-pg" "$PREFIXO-redis" >/dev/null 2>&1 || true
echo "containers $PREFIXO-pg e $PREFIXO-redis removidos"
