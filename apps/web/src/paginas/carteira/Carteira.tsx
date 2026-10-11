import type { Carteira as CarteiraDTO, RedeConta, StatusContaBinance } from "@zentrade/contratos/esquemas";
import { Link } from "@tanstack/react-router";
import { CircleCheck, KeyRound, RefreshCw, ShieldAlert, TriangleAlert, Wallet } from "lucide-react";
import { useState } from "react";
import { mensagemDe } from "../../api/erros";
import { useAvisos } from "../../componentes/Avisos";
import { Botao } from "../../componentes/Botao";
import { Cabecalho, Painel } from "../../componentes/Cabecalho";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../../componentes/Estados";
import { Segmentado } from "../../componentes/Segmentado";
import { Selo } from "../../componentes/Selo";
import { REDE } from "../../lib/rotulos";
import { formatarRelativo } from "../../lib/tempo";
import { CartoesResumo } from "./CartoesResumo";
import { DetalheMoeda } from "./DetalheMoeda";
import { useCarteira, useSincronizar, useStatusBinance } from "./ganchos";
import { GraficoAlocacao } from "./GraficoAlocacao";
import { TabelaMoedas } from "./TabelaMoedas";
import type { Parcela } from "./tabela";
import "./carteira.css";

const PARCELAS: readonly { valor: Parcela; rotulo: string }[] = [
  { valor: "total", rotulo: "Total" },
  { valor: "robo", rotulo: "Robô" },
  { valor: "manual", rotulo: "Manual" },
];

function BotaoSincronizar({ rede }: { readonly rede: RedeConta | undefined }) {
  const sincronizar = useSincronizar();
  const avisar = useAvisos();
  const aoClicar = () =>
    sincronizar.mutate(rede, {
      onSuccess: (s) => {
        const novas =
          s.negociacoesNovas === 1 ? "1 negociação nova" : `${s.negociacoesNovas} negociações novas`;
        avisar(
          s.parcial ? "info" : "sucesso",
          s.parcial
            ? `Sincronização parcial (${novas}). ${s.avisos.at(-1) ?? ""}`
            : `Carteira sincronizada: ${novas}.`,
        );
      },
      onError: (e) => avisar("erro", mensagemDe(e)),
    });
  return (
    <Botao variante="primario" icone={RefreshCw} carregando={sincronizar.isPending} onClick={aoClicar}>
      {sincronizar.isPending ? "Sincronizando…" : "Sincronizar agora"}
    </Botao>
  );
}

/** Uma faixa por conta com o que a pessoa precisa saber da chave (saque, IP, só leitura). */
function StatusChave({ conta }: { readonly conta: StatusContaBinance }) {
  if (!conta.conectada)
    return (
      <div className="faixa faixa--atencao" role="status">
        <TriangleAlert size={18} aria-hidden="true" />
        <p>
          <strong>
            A Binance ({REDE[conta.rede].texto}) não aceitou a chave {conta.apiKeyFinal}.
          </strong>{" "}
          {conta.erro}
        </p>
      </div>
    );
  const graves = conta.avisos.filter((a) => /SAQUE|IP/.test(a));
  if (graves.length === 0) return null;
  return (
    <div className="faixa faixa--atencao" role="status">
      <ShieldAlert size={18} aria-hidden="true" />
      <p>{graves.join(" ")}</p>
      <Link to="/contas" className="botao botao--secundario botao--pequeno">
        Trocar a chave
      </Link>
    </div>
  );
}

function Situacao({ c }: { readonly c: CarteiraDTO }) {
  const s = c.sincronizacao;
  return (
    <p className="carteira-situacao">
      {c.rede ? <Selo tom={REDE[c.rede].tom}>{REDE[c.rede].texto}</Selo> : null}
      {s ? (
        <Selo tom={s.ok ? "neutro" : "atencao"} icone={s.ok ? CircleCheck : TriangleAlert}>
          {s.ok ? "Sincronizada" : "Sincronização incompleta"} {formatarRelativo(s.em)}
        </Selo>
      ) : null}
      <span className="apagado">Valores em USDT. Uma chave só de leitura basta para a carteira.</span>
    </p>
  );
}

function SemConta() {
  return (
    <EstadoVazio
      icone={KeyRound}
      titulo="Nenhuma conta da Binance conectada"
      acao={
        <Link to="/contas" className="botao botao--primario">
          Cadastrar uma chave
        </Link>
      }
    >
      A carteira lê seus saldos e suas negociações direto da Binance. Uma chave <strong>só de leitura</strong>{" "}
      basta: crie-a sem permissão de saque e presa ao IP do servidor.
    </EstadoVazio>
  );
}

function ComoCalculamos() {
  return (
    <div className="carteira-como">
      <ul>
        <li>
          <strong>Preço médio ponderado</strong>, o mesmo do motor: cada compra soma quantidade × preço ao
          custo; cada venda tira do custo a fração vendida e realiza a diferença para o preço de venda.
        </li>
        <li>
          <strong>Realizado bruto</strong> não desconta taxas; o <strong>líquido</strong> desconta todas
          (compra e venda). <strong>Não realizado</strong> = valor atual − custo da posição.
        </li>
        <li>
          Taxas pagas em BNB, na moeda negociada ou na de cotação são convertidas para USDT pelo preço do
          instante da negociação.
        </li>
        <li>
          Saldo que nenhuma negociação explica (depósito, transferência) aparece como{" "}
          <strong>custo desconhecido</strong>: entra no valor da conta, nunca no preço médio nem no resultado.
        </li>
        <li>
          <strong>Robô</strong> são as ordens enviadas pelo ZenTrade; <strong>manual</strong>, todas as
          outras. Cada parcela tem o próprio preço médio, então a soma das duas pode diferir do total.
        </li>
      </ul>
      <p className="apagado">Números do passado; não são previsão nem recomendação.</p>
    </div>
  );
}

function Conteudo({
  c,
  parcela,
  aoAbrir,
}: {
  c: CarteiraDTO;
  parcela: Parcela;
  aoAbrir: (a: string) => void;
}) {
  if (!c.conectada) return <SemConta />;
  return (
    <div className="pilha">
      <Situacao c={c} />
      {c.avisos.map((a) => (
        <p key={a} className="carteira-aviso">
          <TriangleAlert size={14} aria-hidden="true" className="atencao" /> {a}
        </p>
      ))}
      <CartoesResumo resumo={c.resumo} parcela={parcela} />
      {c.moedas.length === 0 ? (
        <EstadoVazio icone={Wallet} titulo="Conta vazia">
          A Binance não mostrou saldo nem negociação nesta conta. Depois de comprar ou depositar, sincronize
          de novo.
        </EstadoVazio>
      ) : (
        <Painel titulo="Por moeda" id="titulo-moedas" semBorda>
          <TabelaMoedas moedas={c.moedas} resumo={c.resumo} parcela={parcela} aoAbrir={aoAbrir} />
        </Painel>
      )}
      <div className="grade-dupla carteira-grade">
        {c.moedas.length > 0 ? (
          <Painel titulo="Alocação" id="titulo-alocacao">
            <GraficoAlocacao moedas={c.moedas} />
          </Painel>
        ) : null}
        <Painel titulo="Como estes números são calculados" id="titulo-como">
          <ComoCalculamos />
        </Painel>
      </div>
    </div>
  );
}

export function Carteira() {
  const [rede, setRede] = useState<RedeConta | undefined>(undefined);
  const [parcela, setParcela] = useState<Parcela>("total");
  const [aberta, setAberta] = useState<string | null>(null);
  const carteira = useCarteira(rede);
  const status = useStatusBinance();
  const c = carteira.data;
  const redeAtual = c?.rede ?? rede;
  return (
    <>
      <Cabecalho
        titulo="Carteira"
        acoes={c?.conectada ? <BotaoSincronizar rede={redeAtual ?? undefined} /> : null}
      >
        Tudo o que você tem na Binance: quanto investiu, quanto vale hoje, quanto rendeu e quanto pagou de
        taxa — do robô e o que você negociou à mão.
      </Cabecalho>
      {status.data?.contas.map((conta) => (
        <StatusChave key={conta.id} conta={conta} />
      ))}
      {c && c.redes.length > 1 ? (
        <Segmentado
          rotulo="Conta"
          opcoes={c.redes.map((r) => ({ valor: r, rotulo: REDE[r].texto }))}
          valor={redeAtual ?? "real"}
          aoMudar={setRede}
        />
      ) : null}
      {c?.conectada ? (
        <Segmentado rotulo="Parcela" opcoes={PARCELAS} valor={parcela} aoMudar={setParcela} />
      ) : null}
      {carteira.isPending ? <Esqueleto altura={320} rotulo="Carregando a carteira" /> : null}
      {carteira.error ? (
        <ErroCarregar erro={carteira.error} tentarDeNovo={() => void carteira.refetch()} />
      ) : null}
      {c ? <Conteudo c={c} parcela={parcela} aoAbrir={setAberta} /> : null}
      <DetalheMoeda ativo={aberta} rede={redeAtual ?? undefined} aoFechar={() => setAberta(null)} />
    </>
  );
}
