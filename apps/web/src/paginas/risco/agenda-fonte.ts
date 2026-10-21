import {
  EventoMercadoEsquema,
  ResultadoSugestaoEventosEsquema,
  type EventoMercadoDTO,
  type NovoEventoMercadoDTO,
  type ResultadoSugestaoEventos,
} from "@zentrade/contratos/esquemas";
import { diaNoFuso, FUSO_PADRAO } from "@zentrade/dominio";
import { z } from "zod";
import { ErroApi } from "../../api/erros";
import { criarCliente, type ClienteApi } from "../../api/cliente";

/**
 * De onde a agenda de eventos de mercado (Copom, payroll, eleição…) vem: a API
 * (`/eventos-mercado`) ou a demonstração. O filtro de dia perigoso dos robôs e dos
 * backtests lê esta agenda.
 */
export interface FonteAgenda {
  listar(de: string, ate: string): Promise<EventoMercadoDTO[]>;
  criar(e: NovoEventoMercadoDTO): Promise<EventoMercadoDTO>;
  confirmar(id: string): Promise<EventoMercadoDTO>;
  remover(id: string): Promise<void>;
  sugerir(): Promise<ResultadoSugestaoEventos>;
}

export function criarFonteAgenda(cliente: ClienteApi = criarCliente()): FonteAgenda {
  const { pedir } = cliente;
  return {
    listar: (de, ate) =>
      pedir("GET", "/eventos-mercado", z.array(EventoMercadoEsquema), undefined, { de, ate }),
    criar: (e) => pedir("POST", "/eventos-mercado", EventoMercadoEsquema, e),
    confirmar: (id) =>
      pedir("POST", `/eventos-mercado/${encodeURIComponent(id)}/confirmar`, EventoMercadoEsquema),
    remover: async (id) => void (await pedir("DELETE", `/eventos-mercado/${encodeURIComponent(id)}`, null)),
    sugerir: () => pedir("POST", "/eventos-mercado/sugerir", ResultadoSugestaoEventosEsquema),
  };
}

const DIA_MS = 86_400_000;
const diaEm = (agora: number, dias: number): string => diaNoFuso(agora + dias * DIA_MS, FUSO_PADRAO);

/** Eventos de exemplo nas próximas semanas, para a demonstração (sem instalação nova). */
function eventosIniciais(agora: number): EventoMercadoDTO[] {
  const base = { origem: "manual", de: null, ate: null, criadoEm: agora } as const;
  return [
    {
      id: "ev-1",
      data: diaEm(agora, 3),
      mercado: "win",
      titulo: "Copom — decisão da Selic",
      impacto: "alto",
      ...base,
    },
    {
      id: "ev-2",
      data: diaEm(agora, 9),
      mercado: "todos",
      titulo: "Payroll (EUA)",
      impacto: "alto",
      ...base,
    },
    { id: "ev-3", data: diaEm(agora, 16), mercado: "win", titulo: "IPCA", impacto: "medio", ...base },
  ];
}

/** Sugestões que o "Claude" da demonstração devolve (sempre as mesmas, marcadas como sugeridas). */
const SUGESTOES_DEMO = [
  { dias: 2, mercado: "todos", titulo: "CPI (EUA)", impacto: "alto" },
  { dias: 5, mercado: "cripto", titulo: "Ata do FOMC (data a confirmar)", impacto: "medio" },
] as const;

/** A demonstração guarda a agenda na memória da aba: cadastrar, confirmar e remover mudam a tela. */
export function criarFonteAgendaDemo(agora: () => number = Date.now, vazio = false): FonteAgenda {
  let eventos: EventoMercadoDTO[] = vazio ? [] : eventosIniciais(agora());
  let proximo = 100;
  const existe = (e: Pick<NovoEventoMercadoDTO, "data" | "mercado" | "titulo">) =>
    eventos.some((x) => x.data === e.data && x.mercado === e.mercado && x.titulo === e.titulo.trim());
  const nova = (e: NovoEventoMercadoDTO, origem: "manual" | "sugerido"): EventoMercadoDTO => ({
    id: `ev-${proximo++}`,
    data: e.data,
    mercado: e.mercado,
    titulo: e.titulo.trim(),
    impacto: e.impacto,
    origem,
    de: e.de ?? null,
    ate: e.ate ?? null,
    criadoEm: agora(),
  });
  return {
    listar: async (de, ate) =>
      eventos.filter((e) => e.data >= de && e.data <= ate).sort((a, b) => a.data.localeCompare(b.data)),
    criar: async (e) => {
      if (existe(e))
        throw new ErroApi(
          "conflito",
          `Já existe um evento "${e.titulo.trim()}" em ${e.data} para este mercado.`,
          409,
        );
      const criado = nova(e, "manual");
      eventos = [...eventos, criado];
      return criado;
    },
    confirmar: async (id) => {
      const atual = eventos.find((e) => e.id === id);
      if (!atual) throw new ErroApi("nao_encontrado", "Esse evento não existe mais.", 404);
      const confirmado = { ...atual, origem: "manual" } as const;
      eventos = eventos.map((e) => (e.id === id ? confirmado : e));
      return confirmado;
    },
    remover: async (id) => {
      eventos = eventos.filter((e) => e.id !== id);
    },
    sugerir: async () => {
      const lote = SUGESTOES_DEMO.map((s) => ({
        data: diaEm(agora(), s.dias),
        mercado: s.mercado,
        titulo: s.titulo,
        impacto: s.impacto,
      }));
      const novos = lote.filter((e) => !existe(e)).map((e) => nova(e, "sugerido"));
      eventos = [...eventos, ...novos];
      return { criados: novos, descartados: 0, jaExistiam: lote.length - novos.length };
    },
  };
}
