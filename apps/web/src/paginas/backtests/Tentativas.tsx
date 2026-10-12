import { History } from "lucide-react";
import type { Backtest } from "../../api/esquemas";
import { Painel } from "../../componentes/Cabecalho";
import { CartaoKpi, GradeKpi } from "../../componentes/Kpi";
import { anos, pct, razao } from "./formato";

/**
 * Quantas vezes esta estratégia foi testada e o que isso faz com a confiança no Sharpe.
 * Cada backtest concluído (de qualquer versão) conta: mudar um parâmetro e rodar de novo
 * é uma nova tentativa, e o melhor de muitas tentativas tende a ser sorte.
 */
export function Tentativas({ b }: { readonly b: Backtest }) {
  const t = b.tentativas;
  if (!t) return null;
  const anosTestados = b.metricas?.anos;
  const curto = t.anosMinimos !== null && anosTestados !== undefined && anosTestados < t.anosMinimos;
  return (
    <Painel
      titulo={`${t.total} ${t.total === 1 ? "tentativa" : "tentativas"} desta estratégia`}
      id={`tentativas-${b.id}`}
      icone={History}
      descricao={`${t.daVersao} nesta versão, ${t.versoes} ${t.versoes === 1 ? "versão" : "versões"} testadas. Quanto mais tentativas, maior a chance de um bom resultado sair por acaso — o ZenTrade conta todas.`}
    >
      {t.sharpeDeflacionado === null ? (
        <p className="bt-nota">
          Este backtest não tem Sharpe para testar (backtest antigo ou sem variação no patrimônio).
        </p>
      ) : (
        <GradeKpi rotulo="Sharpe diante das tentativas" colunas={4}>
          <CartaoKpi
            rotulo="Sharpe deflacionado"
            valor={<span className="num">{pct(t.sharpeDeflacionado, 0)}</span>}
            {...(t.sharpeDeflacionado < 0.95 ? { tom: "atencao" as const } : {})}
            nota={`Chance de o Sharpe ser real descontando as ${t.total} tentativas (Bailey & López de Prado).`}
          />
          <CartaoKpi
            rotulo="Sem descontar tentativas"
            valor={<span className="num">{pct(t.probabilidadeSharpe, 0)}</span>}
            nota="A mesma chance olhando só este backtest (Sharpe probabilístico)."
          />
          <CartaoKpi
            rotulo="Sharpe que o acaso daria"
            valor={<span className="num">{razao(t.sharpeMaximoEsperado)}</span>}
            nota={`O melhor de ${t.total} tentativas sem habilidade nenhuma, em média. Com desconto de Harvey & Liu: ${razao(t.sharpeComDesconto)}.`}
          />
          <CartaoKpi
            rotulo="Período mínimo"
            valor={<span className="num">{t.anosMinimos === null ? "—" : anos(t.anosMinimos)}</span>}
            {...(curto ? { tom: "atencao" as const } : {})}
            nota={
              t.anosMinimos === null
                ? "Com uma tentativa só (ou Sharpe ≤ 0), não se aplica."
                : `Para esse Sharpe não sair por acaso em ${t.total} tentativas (MinBTL). O teste tem ${anos(anosTestados ?? 0)}.`
            }
          />
        </GradeKpi>
      )}
    </Painel>
  );
}
