import type { Sql } from "postgres";
import type {
  DocumentoParaGravar,
  FiltroBusca,
  RepositorioConhecimento,
  TrechoEncontradoBruto,
  TrechoParaGravar,
} from "../tipos.js";

interface LinhaTrecho {
  readonly trecho_id: string;
  readonly documento_id: string;
  readonly fonte: TrechoEncontradoBruto["fonte"];
  readonly titulo: string;
  readonly url: string | null;
  readonly publicado_em: Date | string;
  readonly texto: string;
}

const paraTrecho = (l: LinhaTrecho): TrechoEncontradoBruto => ({
  trechoId: l.trecho_id,
  documentoId: l.documento_id,
  fonte: l.fonte,
  titulo: l.titulo,
  url: l.url,
  // A conexão do Drizzle (API) devolve timestamptz como texto; a do agente, como Date.
  publicadoEm: new Date(l.publicado_em),
  texto: l.texto,
});

/** pgvector aceita o vetor como texto '[0.1,0.2,…]' com cast ::vector. */
const literalVetor = (v: readonly number[]): string => `[${v.join(",")}]`;

/** Repositório do RAG sobre postgres.js, nas tabelas `documentos` e `trechos` do contrato. */
export function criarRepositorioPostgres(sql: Sql): RepositorioConhecimento {
  const filtroFontes = (f: FiltroBusca) =>
    f.fontes ? sql`and d.fonte = any(${sql.array([...f.fontes])})` : sql``;

  return {
    async documentoPorHash(usuarioId, hash) {
      const [linha] = await sql<{ id: string }[]>`
        select id from documentos where usuario_id = ${usuarioId} and hash_conteudo = ${hash}`;
      return linha?.id ?? null;
    },

    async gravarDocumento(doc: DocumentoParaGravar, trechos: readonly TrechoParaGravar[]) {
      return sql.begin(async (tx) => {
        const [inserido] = await tx<{ id: string }[]>`
          insert into documentos (id, usuario_id, fonte, titulo, url, publicado_em, hash_conteudo)
          values (${doc.id}, ${doc.usuarioId}, ${doc.fonte}, ${doc.titulo}, ${doc.url}, ${doc.publicadoEm},
                  ${doc.hashConteudo})
          on conflict (usuario_id, hash_conteudo) do nothing
          returning id`;
        if (!inserido) {
          // Outro processo gravou o mesmo conteúdo entre a checagem e aqui.
          const [existente] = await tx<{ id: string }[]>`
            select id from documentos where usuario_id = ${doc.usuarioId} and hash_conteudo = ${doc.hashConteudo}`;
          return { documentoId: existente?.id ?? doc.id, novo: false };
        }
        for (const t of trechos) {
          await tx`
            insert into trechos (id, documento_id, usuario_id, ordem, texto, embedding)
            values (${t.id}, ${doc.id}, ${doc.usuarioId}, ${t.ordem}, ${t.texto}, ${literalVetor(t.embedding)}::vector)`;
        }
        return { documentoId: doc.id, novo: true };
      });
    },

    async buscarVetorial(f, vetor) {
      const linhas = await sql<LinhaTrecho[]>`
        select t.id as trecho_id, t.documento_id, d.fonte, d.titulo, d.url, d.publicado_em, t.texto
        from trechos t join documentos d on d.id = t.documento_id
        where t.usuario_id = ${f.usuarioId} ${filtroFontes(f)}
        order by t.embedding <=> ${literalVetor(vetor)}::vector
        limit ${f.limite}`;
      return linhas.map(paraTrecho);
    },

    async buscarTextual(f, termos) {
      const linhas = await sql<LinhaTrecho[]>`
        select t.id as trecho_id, t.documento_id, d.fonte, d.titulo, d.url, d.publicado_em, t.texto
        from trechos t join documentos d on d.id = t.documento_id,
             to_tsquery('simple', ${termos}) q
        where t.usuario_id = ${f.usuarioId} and t.busca @@ q ${filtroFontes(f)}
        order by ts_rank(t.busca, q) desc, t.id
        limit ${f.limite}`;
      return linhas.map(paraTrecho);
    },
  };
}
