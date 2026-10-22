import type { EstrategiaDTO, Intervalo, Rede } from "@zentrade/contratos/esquemas";
import { direcaoDe } from "@zentrade/dominio";
import { Eye, Plus, TriangleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Botao } from "../../componentes/Botao";
import { CampoSelecao, CampoTexto } from "../../componentes/Campo";
import type { NovoRobo } from "../../api/fonte";
import { frasesSaidas } from "../../construtor/descrever";
import { paraDominio } from "../../lib/estrategia";
import { REDE } from "../../lib/rotulos";
import { CamposLimites, useCamposLimites } from "./EditorLimites";

const PARES = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"];
const INTERVALOS: readonly Intervalo[] = ["5m", "15m", "30m", "1h", "4h", "1d"];
const LIMITES_INICIAIS = {
  perdaDiariaMaxima: "20",
  exposicaoMaxima: "300",
  riscoPorOperacao: "5",
  ordensPorHoraMax: 4,
  pausaAposPerdaMin: 60,
  confiancaMinima: 0.65,
  diasDeEvento: "ignorar" as const,
  agente: "decide" as const,
};

/** As saídas da estratégia em uma linha, para saber como o robô vai sair antes de criá-lo. */
function resumoSaidas(e: EstrategiaDTO): string {
  const frases = frasesSaidas({ ...paraDominio(e), stop: e.stop });
  return `Sai com ${frases.join("; ")}.`;
}

/** Criar robô. Ele nasce sempre observando; os limites já vêm prudentes. */
export function FormRobo({
  estrategias: todas,
  enviando,
  aoCriar,
  aoCancelar,
}: {
  readonly estrategias: readonly EstrategiaDTO[];
  readonly enviando: boolean;
  readonly aoCriar: (r: NovoRobo) => void;
  readonly aoCancelar: () => void;
}) {
  // O robô opera o à vista de cripto, que só compra: estratégia que vende fica de fora.
  const estrategias = todas.filter((x) => direcaoDe(x) === "comprado");
  const deFora = todas.length - estrategias.length;
  const [nome, setNome] = useState("");
  const [simbolo, setSimbolo] = useState(PARES[0] ?? "BTCUSDT");
  const [intervalo, setIntervalo] = useState<Intervalo>("1h");
  const [rede, setRede] = useState<Rede>("papel");
  const [estrategiaId, setEstrategiaId] = useState(estrategias[0]?.id ?? "");
  const [erroNome, setErroNome] = useState<string | null>(null);
  const limites = useCamposLimites(LIMITES_INICIAIS);
  const escolhida = estrategias.find((x) => x.id === estrategiaId);

  const enviar = (e: FormEvent): void => {
    e.preventDefault();
    const nomeOk = nome.trim().length > 0 && nome.trim().length <= 80;
    setErroNome(nomeOk ? null : "Dê um nome de até 80 letras, para reconhecer o robô nas decisões.");
    const lim = limites.validar();
    const estrategia = estrategias.find((x) => x.id === estrategiaId);
    if (!nomeOk || !lim || !estrategia) return;
    aoCriar({
      nome: nome.trim(),
      simbolo,
      intervalo,
      rede,
      estrategiaId,
      estrategiaVersao: estrategia.versao,
      limites: lim,
    });
  };

  if (estrategias.length === 0) {
    return (
      <p className="apagado">
        Antes, crie uma estratégia que só compra na tela Estratégias: o robô precisa de regras para seguir.
      </p>
    );
  }

  return (
    <form className="formulario" onSubmit={enviar} noValidate>
      <p className="nota">
        <Eye size={16} aria-hidden="true" /> O robô nasce no modo <strong>Observar</strong>: só registra o que
        faria. Você muda o modo depois.
      </p>
      {deFora > 0 ? (
        <p className="apagado">
          {deFora === 1
            ? "Uma estratégia que vende não aparece"
            : `${deFora} estratégias que vendem não aparecem`}{" "}
          aqui: o robô opera o à vista de cripto, que só compra. Elas rodam no backtest do mini índice.
        </p>
      ) : null}
      <div className="grade-campos">
        <CampoTexto
          rotulo="Nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          erro={erroNome}
          maxLength={80}
          // eslint-disable-next-line jsx-a11y-x/no-autofocus -- foco inicial do diálogo (padrão WAI-ARIA de modal)
          autoFocus
        />
        <CampoSelecao
          rotulo="Estratégia"
          dica={escolhida ? resumoSaidas(escolhida) : undefined}
          value={estrategiaId}
          onChange={(e) => setEstrategiaId(e.target.value)}
        >
          {estrategias.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nome} (versão {x.versao})
            </option>
          ))}
        </CampoSelecao>
        <CampoSelecao rotulo="Par" value={simbolo} onChange={(e) => setSimbolo(e.target.value)}>
          {PARES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </CampoSelecao>
        <CampoSelecao
          rotulo="Intervalo dos candles"
          value={intervalo}
          onChange={(e) => setIntervalo(e.target.value as Intervalo)}
        >
          {INTERVALOS.map((i) => (
            <option key={i}>{i}</option>
          ))}
        </CampoSelecao>
        <CampoSelecao
          rotulo="Onde opera"
          value={rede}
          onChange={(e) => setRede(e.target.value as Rede)}
          dica={REDE[rede].descricao}
        >
          {(Object.keys(REDE) as Rede[]).map((r) => (
            <option key={r} value={r}>
              {REDE[r].texto}
            </option>
          ))}
        </CampoSelecao>
      </div>
      {rede === "real" ? (
        <p className="nota nota--perigo" role="alert">
          <TriangleAlert size={16} aria-hidden="true" /> Dinheiro real: comece pela testnet. Para ligar o
          automático aqui, será preciso confirmar sua identidade.
        </p>
      ) : null}
      <h3 className="formulario__secao">Limites de risco</h3>
      <CamposLimites campos={limites.campos} erros={limites.erros} mudar={limites.mudar} />
      <div className="formulario__acoes">
        <Botao variante="fantasma" onClick={aoCancelar}>
          Cancelar
        </Botao>
        <Botao type="submit" variante="primario" icone={Plus} carregando={enviando}>
          Criar robô
        </Botao>
      </div>
    </form>
  );
}
