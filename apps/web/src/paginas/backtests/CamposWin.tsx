import { FileUp } from "lucide-react";
import { CampoSelecao, CampoTexto } from "../../componentes/Campo";
import { EstadoVazio } from "../../componentes/Estados";
import { criarApiImportacaoB3 } from "./apiB3";
import { GrupoExecucao, GrupoValidacao, type Avancado } from "./CamposCripto";
import { EnvioB3 } from "./EnvioB3";
import type { CamposWin, ErrosWin } from "./formularioWin";

/** O texto da aproximação pelo Ibovespa: no formulário e no resultado, igual. */
export const TEXTO_APROXIMACAO =
  "Aproximação: o índice à vista não tem a base do futuro nem o horário completo do WIN; valide com dados reais do WIN antes de operar.";

/**
 * Sem candles do WIN de verdade: suba o .zip "Negócio a negócio" baixado à mão no BDI
 * (o sistema nunca baixa nada da B3: ela proíbe coleta automatizada das próprias
 * páginas). O motor lê, monta as velas de 5m, 15m e 1h e grava — só falta soltar o
 * arquivo aqui. Em modo de demonstração, o envio precisa da API de verdade.
 */
export function SemDadosWin({
  demo = false,
  aoImportar,
}: {
  readonly demo?: boolean;
  readonly aoImportar?: () => void;
}) {
  return (
    <EstadoVazio compacto icone={FileUp} titulo="Ainda não há candles do WIN importados">
      <p>
        O backtest do mini índice lê os candles do banco; nenhum dado da B3 é baixado sozinho (a B3 proíbe
        coleta automatizada das próprias páginas). Baixe o arquivo "Negócio a negócio" no BDI da B3
        (Derivativos → Derivativos de bolsa → tabela "Negócio a negócio" → "Histórico dos últimos 20 dias
        úteis") e solte o .zip abaixo: o motor lê, monta as velas e grava.
      </p>
      {demo ? (
        <p className="apagado">O envio do .zip funciona com a API rodando (fora do modo de demonstração).</p>
      ) : (
        <EnvioB3 api={criarApiImportacaoB3()} {...(aoImportar ? { aoConcluir: aoImportar } : {})} />
      )}
      <p>
        Alternativa: o histórico exportado do MetaTrader 5 da corretora (Exibir → Símbolos → aba Barras → WIN
        contínuo, como <code>WIN$</code> → M5 → Pedir → Exportar barras), importado com{" "}
        <code>
          pnpm --filter @zentrade/motor importar-candles-csv -- --simbolo WIN --intervalo 5m --arquivo
          WIN_M5.csv
        </code>
        . Ou, com a conta demo do MetaTrader 5 cadastrada em Contas e chaves e o perfil <code>mt5</code>{" "}
        ligado, use o botão "Atualizar dados do WIN". Detalhes (fuso do servidor, rolagem) em{" "}
        <code>docs/dados-b3.md</code>.
      </p>
    </EstadoVazio>
  );
}

/** Custos por contrato, sessão de Brasília, tamanho e margem, limites e validação do WIN. */
export function CamposDoWin({
  c,
  erros,
  mudar,
  a,
  mudarAvancado,
}: {
  readonly c: CamposWin;
  readonly erros: ErrosWin;
  readonly mudar: (parcial: Partial<CamposWin>) => void;
  readonly a: Avancado;
  readonly mudarAvancado: (parcial: Partial<Avancado>) => void;
}) {
  return (
    <div className="bt-avancado__grade">
      <fieldset className="bt-avancado__grupo">
        <legend>Custos por contrato, em cada lado</legend>
        <CampoTexto
          rotulo="Tarifa da B3 (R$)"
          dica="Emolumentos e registro de day trade para quem opera pouco. A nota de corretagem do primeiro mês diz o valor certo."
          inputMode="decimal"
          value={c.tarifa}
          erro={erros.tarifa}
          onChange={(e) => mudar({ tarifa: e.target.value })}
        />
        <CampoTexto
          rotulo="Corretagem (R$)"
          dica="Muitas corretoras zeram a corretagem de minicontratos."
          inputMode="decimal"
          value={c.corretagem}
          erro={erros.corretagem}
          onChange={(e) => mudar({ corretagem: e.target.value })}
        />
        <CampoTexto
          rotulo="Deslizamento (ticks)"
          dica="1 tick = 5 pontos = R$ 1,00 por contrato, contra você em toda execução: entrada, stop, alvo e zeragem."
          inputMode="numeric"
          value={c.ticks}
          erro={erros.ticks}
          onChange={(e) => mudar({ ticks: e.target.value })}
        />
      </fieldset>
      <fieldset className="bt-avancado__grupo">
        <legend>Sessão (horário de Brasília)</legend>
        <CampoTexto
          rotulo="Início das entradas"
          dica="Antes disso não abre posição (pré-abertura e primeiros minutos)."
          type="time"
          value={c.inicioEntradas}
          onChange={(e) => mudar({ inicioEntradas: e.target.value })}
        />
        <CampoTexto
          rotulo="Corte das entradas"
          dica="Depois disso não abre posição nova."
          type="time"
          value={c.fimEntradas}
          onChange={(e) => mudar({ fimEntradas: e.target.value })}
        />
        <CampoTexto
          rotulo="Zeragem"
          dica="Zera tudo no fechamento do candle que termina nessa hora (ou no último candle do dia): nada dorme posicionado."
          type="time"
          value={c.zeragem}
          erro={erros.zeragem}
          onChange={(e) => mudar({ zeragem: e.target.value })}
        />
        <label className="interruptor">
          <input
            type="checkbox"
            checked={c.pularLeilao}
            onChange={(e) => mudar({ pularLeilao: e.target.checked })}
          />
          <span>
            Não abrir no candle do leilão de abertura{" "}
            <span className="apagado">(o primeiro candle do dia)</span>
          </span>
        </label>
      </fieldset>
      <fieldset className="bt-avancado__grupo">
        <legend>Tamanho, margem e limites</legend>
        <CampoTexto
          rotulo="Capital simulado (R$)"
          inputMode="decimal"
          value={c.capital}
          erro={erros.capital}
          onChange={(e) => mudar({ capital: e.target.value })}
        />
        <CampoTexto
          rotulo="Risco por operação (R$)"
          dica="Contratos = risco ÷ (pontos do stop × R$ 0,20 + custos de ida e volta), arredondado para baixo. Se não cabe 1, não opera."
          inputMode="decimal"
          value={c.risco}
          erro={erros.risco}
          onChange={(e) => mudar({ risco: e.target.value })}
        />
        <CampoTexto
          rotulo="Contratos no máximo"
          inputMode="numeric"
          value={c.contratos}
          erro={erros.contratos}
          onChange={(e) => mudar({ contratos: e.target.value })}
        />
        <CampoTexto
          rotulo="Margem por contrato (R$)"
          dica="A margem mínima de day trade da B3 é R$ 155; a corretora pode exigir mais. Margem não é risco."
          inputMode="decimal"
          value={c.margem}
          erro={erros.margem}
          onChange={(e) => mudar({ margem: e.target.value })}
        />
        <CampoSelecao
          rotulo="Limites de risco"
          dica="Os freios de um robô novo: perda diária de 2% do capital, 4 ordens por hora e pausa de 60 min depois de uma perda."
          value={c.limites}
          onChange={(e) => mudar({ limites: e.target.value as CamposWin["limites"] })}
        >
          <option value="padrao">Os de um robô novo (padrão)</option>
          <option value="sem">Sem limites — menos realista</option>
        </CampoSelecao>
      </fieldset>
      <GrupoExecucao a={a} mudar={mudarAvancado} />
      <GrupoValidacao a={a} mudar={mudarAvancado} />
    </div>
  );
}
