import type { DivergenciaDTO } from "@zentrade/contratos/esquemas";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCheck, RefreshCw, Scale, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { mensagemDe } from "../../api/erros";
import { useAvisos } from "../../componentes/Avisos";
import { Botao } from "../../componentes/Botao";
import { Painel } from "../../componentes/Cabecalho";
import { Confirmar } from "../../componentes/Confirmar";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../../componentes/Estados";
import { Selo } from "../../componentes/Selo";
import { formatarQuantidade } from "../../lib/formatar";
import { REDE } from "../../lib/rotulos";
import { formatarRelativo } from "../../lib/tempo";
import { useAceitarDivergencia, useDivergencias, useReconciliar } from "./ganchos";

function Aberta({ d, aoAceitar }: { readonly d: DivergenciaDTO; readonly aoAceitar: () => void }) {
  const robos = d.robos.map((r) => r.nome).join(", ") || "nenhum robô com posição";
  return (
    <li className="divergencia divergencia--aberta">
      <div className="pausa__topo">
        <Selo tom="perda" icone={Scale}>
          Falta {formatarQuantidade(d.falta)} {d.ativo}
        </Selo>
        <Selo tom={REDE[d.rede].tom}>{REDE[d.rede].texto}</Selo>
        <span className="apagado">desde {formatarRelativo(d.detectadaEm)}</span>
      </div>
      <p>
        Os robôs registram <strong className="num">{formatarQuantidade(d.esperado)}</strong> {d.ativo}, mas a
        Binance tem <strong className="num">{formatarQuantidade(d.naCorretora)}</strong> (livre + preso em
        ordens). Compras com {d.ativo} ficam paradas ({robos}); nada foi vendido nem comprado para corrigir.
      </p>
      <details className="divergencia__investigar">
        <summary>Como investigar</summary>
        <ul>
          <li>Na Binance, veja o histórico de ordens e de negociações de {d.ativo}: houve venda manual?</li>
          <li>Um saque, uma conversão de poeira ou uma transferência para outra carteira tirou {d.ativo}?</li>
          <li>
            Compare com as ordens do robô:{" "}
            <Link to="/ordens" className="link-seta">
              ver ordens <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </li>
        </ul>
      </details>
      <div className="formulario__acoes">
        <Botao pequeno variante="perigo" icone={CheckCheck} onClick={aoAceitar}>
          Aceitar saldo da corretora
        </Botao>
      </div>
    </li>
  );
}

/**
 * Conferência da posição dos robôs com o saldo da Binance (livre + bloqueado). Só a
 * falta conta: saldo a mais é normal (moedas suas fora dos robôs, saldo da testnet).
 */
export function PainelDivergencias() {
  const divergencias = useDivergencias();
  const reconciliar = useReconciliar();
  const aceitar = useAceitarDivergencia();
  const avisar = useAvisos();
  const [aceitando, setAceitando] = useState<DivergenciaDTO | null>(null);
  const conferir = () =>
    reconciliar.mutate(undefined, {
      onSuccess: (r) => {
        const falhas = r.conferidas.filter((c) => !c.ok);
        const divergentes = r.conferidas.reduce((n, c) => n + c.divergentes, 0);
        if (falhas.length > 0)
          avisar("erro", falhas.map((c) => `${c.rede}: ${c.erro ?? "falhou"}`).join(" "));
        else
          avisar(
            divergentes > 0 ? "info" : "sucesso",
            divergentes > 0
              ? `Conferido: ${divergentes} ativo(s) com saldo abaixo do registrado.`
              : "Conferido: o saldo da corretora bate com os robôs.",
          );
      },
      onError: (e) => avisar("erro", mensagemDe(e)),
    });
  const lista = divergencias.data ?? [];
  const abertas = lista.filter((d) => d.estado === "aberta");
  const fechadas = lista.filter((d) => d.estado !== "aberta").slice(0, 5);
  return (
    <Painel
      titulo="Divergências com a corretora"
      id="titulo-divergencias"
      icone={Scale}
      variante={abertas.length > 0 ? "perigo" : "padrao"}
      descricao="A cada 10 minutos o ZenTrade confere a posição dos robôs com o saldo da Binance (testnet e real)."
      acoes={
        <Botao pequeno icone={RefreshCw} carregando={reconciliar.isPending} onClick={conferir}>
          Conferir agora
        </Botao>
      }
    >
      {divergencias.isPending ? (
        <Esqueleto forma="lista" linhas={2} rotulo="Carregando divergências" />
      ) : null}
      {divergencias.error ? (
        <ErroCarregar erro={divergencias.error} tentarDeNovo={() => void divergencias.refetch()} compacto />
      ) : null}
      {divergencias.data && abertas.length === 0 ? (
        <EstadoVazio compacto icone={ShieldCheck} titulo="Saldo conferido">
          A posição dos robôs bate com a corretora.
        </EstadoVazio>
      ) : null}
      <ul role="list" className="pausas">
        {abertas.map((d) => (
          <Aberta key={d.id} d={d} aoAceitar={() => setAceitando(d)} />
        ))}
      </ul>
      {fechadas.length > 0 ? (
        <ul role="list" className="divergencias__historico apagado">
          {fechadas.map((d) => (
            <li key={d.id}>
              {d.ativo} ({REDE[d.rede].texto}): faltavam {formatarQuantidade(d.falta)},{" "}
              {d.estado === "aceita" ? `aceito por ${d.resolvidaPor ?? "você"}` : "o saldo voltou sozinho"}{" "}
              {d.resolvidaEm ? formatarRelativo(d.resolvidaEm) : ""}.
            </li>
          ))}
        </ul>
      ) : null}
      <Confirmar
        aberto={aceitando !== null}
        titulo={`Aceitar o saldo de ${aceitando?.ativo ?? ""} da corretora?`}
        rotuloConfirmar="Aceitar e ajustar a posição"
        carregando={aceitar.isPending}
        aoCancelar={() => setAceitando(null)}
        aoConfirmar={() =>
          aceitando &&
          aceitar.mutate(aceitando.id, {
            onSuccess: () => {
              avisar("sucesso", "Saldo aceito: a posição dos robôs foi ajustada e as compras voltam.");
              setAceitando(null);
            },
            onError: (e) => avisar("erro", mensagemDe(e)),
          })
        }
      >
        O ZenTrade confere a Binance de novo e, se ainda faltar, baixa{" "}
        {aceitando ? formatarQuantidade(aceitando.falta) : ""} {aceitando?.ativo} da posição dos robôs, ao
        preço médio (sem ganho nem perda no resultado). Nenhuma ordem é enviada. Faça isso só depois de
        entender a diferença. Você vai confirmar sua identidade.
      </Confirmar>
    </Painel>
  );
}
