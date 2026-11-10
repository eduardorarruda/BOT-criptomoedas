-- R2: carimbos de latência do papel do WIN (motor da B3), por ordem executada.
--   atraso_ordem_s : do FECHAMENTO do candle (decisoes.em) até a ordem sair (ordens.criada_em):
--                    soma o EA gravar o CSV, o motor ler (MOTOR_B3_CONSULTA_S), o agente e o risco.
--   atraso_exec_s  : da ordem até a execução (no papel, ~0).
--   desvio_pontos  : execução − fechamento do candle, em pontos, CONTRA quem opera = positivo
--                    (compra mais cara, venda mais barata). Inclui o deslizamento simulado.
-- Uso: docker compose -p zentrade exec -T postgres psql -U zentrade -d zentrade < pesquisa/win-papel/latencia.sql
with base as (
  select r.nome as robo, o.lado, d.em as candle_fechou, o.criada_em, x.em as executou,
         d.preco as preco_candle, x.preco as preco_exec, x.quantidade
  from ordens o
  join decisoes d on d.id = o.decisao_id
  join robos r on r.id = o.robo_id
  join execucoes x on x.ordem_id = o.id
  where o.simbolo = 'WINBRL' and o.estado = 'PREENCHIDA'
)
select robo, lado, to_char(candle_fechou at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as candle,
       round(extract(epoch from criada_em - candle_fechou)::numeric, 1) as atraso_ordem_s,
       round(extract(epoch from executou - criada_em)::numeric, 1) as atraso_exec_s,
       round(case when lado = 'COMPRA' then preco_exec - preco_candle else preco_candle - preco_exec end / 0.2, 0)
         as desvio_pontos,
       quantidade as contratos
from base
order by candle_fechou desc
limit 200;
