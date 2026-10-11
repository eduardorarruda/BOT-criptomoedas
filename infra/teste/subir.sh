#!/usr/bin/env bash
# Sobe PostgreSQL (TimescaleDB + pgvector) e Redis descartáveis para os testes de integração.
# Portas e nomes configuráveis para worktrees em paralelo não brigarem.
set -euo pipefail

PREFIXO="${ZT_TESTE_PREFIXO:-zt-teste}"
PORTA_PG="${ZT_TESTE_PG_PORTA:-55440}"
PORTA_REDIS="${ZT_TESTE_REDIS_PORTA:-56390}"
# Senha só do container descartável de teste, preso em 127.0.0.1.
SENHA_PG="${ZT_TESTE_PG_SENHA:-teste-local}"

subir() {
  local nome="$1"
  shift
  if docker ps --format '{{.Names}}' | grep -qx "$nome"; then
    return 0
  fi
  docker rm -f "$nome" >/dev/null 2>&1 || true
  docker run -d --name "$nome" "$@" >/dev/null
}

subir "$PREFIXO-pg" -p "127.0.0.1:$PORTA_PG:5432" -e POSTGRES_PASSWORD="$SENHA_PG" \
  timescale/timescaledb-ha:pg17
subir "$PREFIXO-redis" -p "127.0.0.1:$PORTA_REDIS:6379" redis:8-alpine

for _ in $(seq 1 90); do
  if docker exec "$PREFIXO-pg" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 &&
    docker exec "$PREFIXO-redis" redis-cli ping 2>/dev/null | grep -q PONG; then
    # Banco separado para os testes do RAG e do agente, que criam as próprias tabelas.
    docker exec "$PREFIXO-pg" psql -U postgres -h 127.0.0.1 -tAc \
      "select 1 from pg_database where datname = 'rag_teste'" | grep -q 1 ||
      docker exec "$PREFIXO-pg" psql -U postgres -h 127.0.0.1 -qc "create database rag_teste" >/dev/null
    echo "pronto: postgres em 127.0.0.1:$PORTA_PG, redis em 127.0.0.1:$PORTA_REDIS"
    echo "export ZT_TESTE_BANCO_URL=postgres://postgres:$SENHA_PG@127.0.0.1:$PORTA_PG/postgres"
    echo "export ZT_TESTE_REDIS_URL=redis://127.0.0.1:$PORTA_REDIS"
    echo "export ZT_TESTE_DATABASE_URL=postgres://postgres:$SENHA_PG@127.0.0.1:$PORTA_PG/rag_teste"
    exit 0
  fi
  sleep 1
done
echo "os containers de teste não ficaram prontos em 90 s; veja: docker logs $PREFIXO-pg" >&2
exit 1
