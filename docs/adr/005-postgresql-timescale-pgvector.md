# ADR 005 — PostgreSQL com Timescale e pgvector

**Situação:** aceita · 2026-10

## Contexto

O sistema guarda três tipos de dado: registros transacionais (decisões, ordens, execuções), séries temporais (candles) e vetores para a busca do agente (RAG). Um banco para cada tipo multiplica backup, operação e pontos de falha para um projeto que roda na máquina de uma pessoa.

## Decisão

- **Um PostgreSQL só**, fonte da verdade, com duas extensões:
  - **TimescaleDB** para os candles (tabelas particionadas por tempo, compressão e consultas por janela).
  - **pgvector** para os trechos do RAG: embeddings de 1024 dimensões, índice HNSW por cosseno, combinados com busca textual (`tsvector`) na mesma consulta.
- O Redis existe só para eventos ao vivo e fila de backtests; nada nele é fonte da verdade.

## Consequências

- Um backup (`pg_dump` ou snapshot do volume) leva tudo. Transações cobrem decisão e ordem juntas.
- Busca híbrida (vetor + texto + filtro por usuário) numa consulta SQL, sem sincronizar dois sistemas.
- A imagem do banco precisa trazer as duas extensões; versões ficam fixadas no ambiente.
- Se um dia o volume de candles crescer além do que uma máquina aguenta, dá para mover só as séries, porque o acesso passa pelas portas de `@zentrade/contratos`.
