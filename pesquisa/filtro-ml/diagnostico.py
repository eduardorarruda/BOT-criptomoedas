"""Diagnóstico DESCRITIVO e pós-hoc (não entra no critério de sucesso): o que a logística vetou
e quanto a diferença de Sharpe contra a regra pura é incerta (bootstrap por blocos mensais).
Uso: python -I diagnostico.py <dataset.csv> 4h
"""
import importlib.util
import os
import sys

import numpy as np
import pandas as pd

spec = importlib.util.spec_from_file_location("avaliar", os.path.join(os.path.dirname(os.path.abspath(__file__)), "avaliar.py"))
av = importlib.util.module_from_spec(spec)
spec.loader.exec_module(av)

df = pd.read_csv(sys.argv[1]).sort_values("sinal_em").reset_index(drop=True)
im = {"4h": 4, "1h": 1}[sys.argv[2]] * 3_600_000
cols = list(df.columns[av.FEATURES_INICIO:])
d = av.rodar_dobras(df, cols, av.pesos_unicidade(df, im))
d0, d1 = av.ms(av.PERIODO_DIAS[0]), av.ms(av.PERIODO_DIAS[1])
n = (d1 - d0) // av.MS_DIA + 1
idx = np.clip((df["fim_em"].to_numpy() - d0) // av.MS_DIA, 0, n - 1).astype(np.int64)
ano = pd.to_datetime(df["sinal_em"], unit="ms").dt.year.to_numpy()
r = df["retorno"].to_numpy() * 100
for nome in ("logistica", "lightgbm"):
    ap = d["modelos"][nome]["aprova"]
    print(nome, "vetadas:", int((~ap).sum()), "| ret médio % aprovadas:", round(r[ap].mean(), 3), "vetadas:", round(r[~ap].mean(), 3) if (~ap).any() else None)
    for a in sorted(set(ano)):
        m = ano == a
        if a >= 2021 and (~ap & m).any():
            print("  ", a, "vetadas", int((~ap & m).sum()), "de", int(m.sum()), "ret% vetadas", round(r[~ap & m].mean(), 3), "aprovadas", round(r[ap & m].mean(), 3))
# Bootstrap por blocos mensais da diferença de Sharpe anual (logística − regra pura).
teste = ((df["sinal_em"] >= av.ms("2021-01-01")) & (df["sinal_em"] < av.ms("2026-10-01"))).to_numpy()
ap = d["modelos"]["logistica"]["aprova"] & teste
sr = av.serie_diaria(df, teste, idx, n)
sm = av.serie_diaria(df, ap, idx, n)
blocos = np.array_split(np.arange(n), n // 30)
rng = np.random.default_rng(20261020)
dif = []
for _ in range(2000):
    esc = np.concatenate([blocos[i] for i in rng.integers(0, len(blocos), len(blocos))])
    dif.append((av.sharpe(sm[esc]) - av.sharpe(sr[esc])) * np.sqrt(365))
print("dif Sharpe anual (logística − regra) bootstrap p5/p50/p95:", np.round(np.percentile(dif, [5, 50, 95]), 3), "| fração > 0:", round(float((np.array(dif) > 0).mean()), 3))
