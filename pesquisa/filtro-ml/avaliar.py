"""Avaliação do filtro de aprendizado de máquina conforme PRE-REGISTRO.md.

Uso: python -I avaliar.py <dataset.csv> <intervalo 4h|1h> <n_tentativas> <saida.json>

Walk-forward de janela crescente por tempo global (6 dobras), purge + embargo de 20 dias,
pesos por unicidade, logística L2 e LightGBM raso com calibração sigmoide, corte por valor
esperado líquido, filtro aleatório (1.000 rodadas) e Sharpe deflacionado. Nada aqui é ajustado
depois de ver resultados: os parâmetros são os do pré-registro.
"""

import json
import sys

import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from scipy.stats import kurtosis, norm, skew
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.preprocessing import StandardScaler

MS_DIA = 86_400_000
EMBARGO_MS = 20 * MS_DIA
MIN_TREINO = 150
N_PARES = 15
RODADAS_NULO = 1000
SEMENTE = 20261020
EULER = 0.5772156649015329
FEATURES_INICIO = 8  # as colunas de features começam depois das 8 primeiras

# Dobras de teste: [início, fim) em UTC, pelo fechamento do candle do sinal.
DOBRAS = [
    ("2021", "2021-01-01", "2022-01-01"),
    ("2022", "2022-01-01", "2023-01-01"),
    ("2023", "2023-01-01", "2024-01-01"),
    ("2024", "2024-01-01", "2025-01-01"),
    ("2025", "2025-01-01", "2026-01-01"),
    ("2026", "2026-01-01", "2026-10-01"),
]
PERIODO_DIAS = ("2021-01-01", "2026-09-30")


def ms(data: str) -> int:
    return int(pd.Timestamp(data, tz="UTC").timestamp() * 1000)


def pesos_unicidade(df: pd.DataFrame, intervalo_ms: int) -> np.ndarray:
    """Unicidade média de cada operação (López de Prado, cap. 4), com teto de 4 simultâneas."""
    ini = (df["entrada_em"].to_numpy() // intervalo_ms).astype(np.int64)
    fim = (df["fim_em"].to_numpy() // intervalo_ms).astype(np.int64)
    base = ini.min()
    conc = np.zeros(fim.max() - base + 2)
    np.add.at(conc, ini - base, 1)
    np.add.at(conc, fim - base + 1, -1)
    conc = np.cumsum(conc)[:-1]
    inverso = np.where(conc > 0, 1.0 / np.maximum(conc, 1), 0.0)
    acum = np.concatenate([[0.0], np.cumsum(inverso)])
    media = (acum[fim - base + 1] - acum[ini - base]) / (fim - ini + 1)
    return np.maximum(media, 0.25)


def modelo_logistica():
    return LogisticRegression(C=0.1, solver="lbfgs", max_iter=2000)


def modelo_lightgbm():
    base = LGBMClassifier(
        n_estimators=120, learning_rate=0.03, max_depth=3, num_leaves=7, min_child_samples=40,
        subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=5.0,
        random_state=0, n_jobs=1, verbose=-1,
    )
    return CalibratedClassifierCV(base, method="sigmoid", cv=3)


def prever(nome: str, x_tr, y_tr, w_tr, x_te) -> np.ndarray:
    if nome == "logistica":
        esc = StandardScaler().fit(x_tr)
        m = modelo_logistica().fit(esc.transform(x_tr), y_tr, sample_weight=w_tr)
        return m.predict_proba(esc.transform(x_te))[:, 1]
    m = modelo_lightgbm().fit(x_tr, y_tr, sample_weight=w_tr)
    return m.predict_proba(x_te)[:, 1]


def ganho_perda(ret: np.ndarray, y: np.ndarray, w: np.ndarray) -> tuple[float, float]:
    """Ganho e perda médios (líquidos, ponderados) estimados só no treino."""
    g = np.average(ret[y == 1], weights=w[y == 1])
    perda = np.average(-ret[y == 0], weights=w[y == 0])
    return float(g), float(perda)


def rodar_dobras(df: pd.DataFrame, cols: list[str], pesos: np.ndarray) -> dict:
    """Probabilidades fora da amostra e aprovações de cada modelo, dobra a dobra."""
    saida = {nome: {"p": np.full(len(df), np.nan), "aprova": np.zeros(len(df), bool)}
             for nome in ("logistica", "lightgbm")}
    dobras = []
    x_all, y_all, r_all = df[cols].to_numpy(), df["rotulo"].to_numpy(), df["retorno"].to_numpy()
    for nome_dobra, ini, fim in DOBRAS:
        teste = ((df["sinal_em"] >= ms(ini)) & (df["sinal_em"] < ms(fim))).to_numpy()
        treino = (df["fim_em"] <= ms(ini) - EMBARGO_MS).to_numpy()
        info = {"dobra": nome_dobra, "n_treino": int(treino.sum()), "n_teste": int(teste.sum())}
        valido = treino.sum() >= MIN_TREINO and len(np.unique(y_all[treino])) == 2
        info["filtro_aplicado"] = bool(valido)
        dobras.append(info)
        if not valido or teste.sum() == 0:
            for nome in saida:
                saida[nome]["aprova"][teste] = True
            continue
        w = pesos[treino] / pesos[treino].mean()
        g, perda = ganho_perda(r_all[treino], y_all[treino], w)
        info["ganho_medio"], info["perda_media"] = g, perda
        for nome in saida:
            p = prever(nome, x_all[treino], y_all[treino], w, x_all[teste])
            saida[nome]["p"][teste] = p
            saida[nome]["aprova"][teste] = p * g - (1 - p) * perda > 0
    return {"modelos": saida, "dobras": dobras}


def serie_diaria(df: pd.DataFrame, aprova: np.ndarray, dias_idx: np.ndarray, n_dias: int) -> np.ndarray:
    ret = df["retorno"].to_numpy() / N_PARES
    return np.bincount(dias_idx[aprova], weights=ret[aprova], minlength=n_dias)


def sharpe(serie: np.ndarray) -> float:
    dp = serie.std(ddof=1)
    return float(serie.mean() / dp) if dp > 0 else 0.0


def sharpe_deflacionado(serie: np.ndarray, var_sr: float, n_tent: int) -> float:
    """Bailey & López de Prado (2014), sobre o Sharpe diário (não anualizado)."""
    sr, t = sharpe(serie), len(serie)
    sr_ref = np.sqrt(var_sr) * ((1 - EULER) * norm.ppf(1 - 1 / n_tent) + EULER * norm.ppf(1 - 1 / (n_tent * np.e)))
    curt = kurtosis(serie, fisher=False)
    denom = np.sqrt(max(1 - skew(serie) * sr + (curt - 1) / 4 * sr**2, 1e-12))
    return float(norm.cdf((sr - sr_ref) * np.sqrt(t - 1) / denom))


def nulo_aleatorio(df, aprova, dias_idx, n_dias, mascaras_dobras) -> np.ndarray:
    """Sharpes diários de filtros aleatórios com a MESMA taxa de aprovação de cada dobra."""
    rng = np.random.default_rng(SEMENTE)
    qtd = [(np.flatnonzero(m), int(aprova[m].sum())) for m in mascaras_dobras]
    sr = np.empty(RODADAS_NULO)
    for r in range(RODADAS_NULO):
        sel = np.zeros(len(df), bool)
        for idx, k in qtd:
            sel[rng.choice(idx, size=k, replace=False)] = True
        sr[r] = sharpe(serie_diaria(df, sel, dias_idx, n_dias))
    return sr


def resumo(df, aprova, serie, p=None) -> dict:
    r = df["retorno"].to_numpy()[aprova]
    return {
        "operacoes": int(aprova.sum()),
        "taxa_aprovacao": float(aprova.mean()),
        "acerto": float((r > 0).mean()) if len(r) else None,
        "retorno_medio_pct": float(r.mean() * 100) if len(r) else None,
        "retorno_somado_pct_capital": float(serie.sum() * 100),
        "sharpe_anual": sharpe(serie) * np.sqrt(365),
    }


def main() -> None:
    caminho, intervalo, n_tent, destino = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
    intervalo_ms = {"4h": 4, "1h": 1}[intervalo] * 3_600_000
    df = pd.read_csv(caminho).sort_values("sinal_em").reset_index(drop=True)
    cols = list(df.columns[FEATURES_INICIO:])
    pesos = pesos_unicidade(df, intervalo_ms)
    dobras = rodar_dobras(df, cols, pesos)
    d0, d1 = ms(PERIODO_DIAS[0]), ms(PERIODO_DIAS[1])
    n_dias = (d1 - d0) // MS_DIA + 1
    dias_idx = np.clip((df["fim_em"].to_numpy() - d0) // MS_DIA, 0, n_dias - 1).astype(np.int64)
    teste_total = ((df["sinal_em"] >= ms(DOBRAS[0][1])) & (df["sinal_em"] < ms(DOBRAS[-1][2]))).to_numpy()
    mascaras = [((df["sinal_em"] >= ms(a)) & (df["sinal_em"] < ms(b))).to_numpy() for _, a, b in DOBRAS]
    candidatos = {"regra_pura": teste_total.copy()}
    for nome, d in dobras["modelos"].items():
        candidatos[nome] = d["aprova"] & teste_total
    series = {n: serie_diaria(df, a, dias_idx, n_dias) for n, a in candidatos.items()}
    var_sr = float(np.var([sharpe(s) for s in series.values()], ddof=1))
    resultado = {"intervalo": intervalo, "sinais_total": len(df), "sinais_teste": int(teste_total.sum()),
                 "n_tentativas": n_tent, "dobras": dobras["dobras"], "candidatos": {}}
    for nome, aprova in candidatos.items():
        info = resumo(df, aprova, series[nome])
        info["sharpe_deflacionado"] = sharpe_deflacionado(series[nome], var_sr, n_tent)
        if nome != "regra_pura":
            p = dobras["modelos"][nome]["p"]
            ok = ~np.isnan(p)
            info["auc_fora_da_amostra"] = float(roc_auc_score(df["rotulo"][ok], p[ok])) if ok.any() else None
            nulo = nulo_aleatorio(df, aprova, dias_idx, n_dias, mascaras)
            sr = sharpe(series[nome]) * np.sqrt(365)
            info["nulo_sharpe_anual_p50"] = float(np.percentile(nulo, 50) * np.sqrt(365))
            info["nulo_sharpe_anual_p95"] = float(np.percentile(nulo, 95) * np.sqrt(365))
            info["percentil_no_nulo"] = float((nulo * np.sqrt(365) < sr).mean() * 100)
        resultado["candidatos"][nome] = info
    regra = resultado["candidatos"]["regra_pura"]["sharpe_deflacionado"]
    for nome in ("logistica", "lightgbm"):
        c = resultado["candidatos"][nome]
        c["bate_regra_no_dsr"] = bool(c["sharpe_deflacionado"] > regra)
        c["passa_p95_nulo"] = bool(c["sharpe_anual"] > c["nulo_sharpe_anual_p95"])
        c["passa_criterio"] = c["bate_regra_no_dsr"] and c["passa_p95_nulo"]
    with open(destino, "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)
    print(json.dumps({k: v for k, v in resultado.items() if k != "dobras"}, ensure_ascii=False, indent=1))
    print(json.dumps(resultado["dobras"], ensure_ascii=False))


if __name__ == "__main__":
    main()
