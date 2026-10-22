import { normalizarEmail } from "./analise";
import { vazio, type LinhaPlanilha } from "./importacao-leads";

// ─────────────────────────────────────────────────────────────────────────
// Planilha de participantes → base de inscritos (abas Participantes e
// Análise), sem precisar do index.html do painel.
//
// A planilha do credenciamento não tem Lead Score. Por isso ela MESCLA em
// vez de substituir: quem já veio do painel mantém classe, nota e respostas
// do formulário, e a planilha atualiza nome, telefone, ingresso e presença.
// Quem não estava na base entra como classe X (sem formulário). Ninguém é
// apagado — sumir com inscrito por causa de um export parcial é pior do que
// sobrar alguém.
// ─────────────────────────────────────────────────────────────────────────

export type InscritoDaPlanilha = {
  email: string;
  nome: string;
  whatsapp: string | null;
  categoriaTicket: string | null;
  d1: boolean;
  d2: boolean;
  d3: boolean;
  extras: Record<string, unknown>;
};

export type LeituraInscritos = {
  inscritos: InscritoDaPlanilha[];
  descartados: number;
  /** A planilha tem colunas de check-in por dia? Sem elas, a presença na base fica como está. */
  temPresenca: boolean;
};

/** O que já está gravado e a planilha pode precisar preservar. */
export type InscritoExistente = {
  email: string;
  whatsapp: string | null;
  categoria_ticket: string | null;
  checkin_feito: boolean;
  d1: boolean;
  d2: boolean;
  d3: boolean;
  extras: Record<string, unknown> | null;
};

const chave = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const ALIASES = {
  email: ["email", "e_mail"],
  nome: ["nome", "participante", "nome_completo"],
  whatsapp: ["telefone", "celular", "whatsapp", "fone"],
  categoriaTicket: ["classificacao", "categoria", "categoria_ticket", "tipo"],
};

/** "Check-in D1", "D1", "Dia 1", "Presença D1" → 1. NPS D1 e afins não contam. */
function diaDaColuna(c: string): number | null {
  const m = chave(c).match(/^(?:check_?in_?|presenca_?|presente_?)?(?:d|dia_?)([123])$/);
  return m ? Number(m[1]) : null;
}

const SIM = new Set(["sim", "s", "x", "true", "1", "presente", "yes"]);
const marcado = (v: unknown) => v === true || SIM.has(String(v ?? "").trim().toLowerCase());
const texto = (v: unknown) => (vazio(v) ? null : String(v).trim());

export function inscritosDaPlanilha(linhas: LinhaPlanilha[]): LeituraInscritos {
  const cabecalhos = linhas.length ? Object.keys(linhas[0]) : [];
  const achar = (aliases: string[]) => cabecalhos.find((c) => aliases.includes(chave(c))) ?? null;
  const col = {
    email: achar(ALIASES.email),
    nome: achar(ALIASES.nome),
    whatsapp: achar(ALIASES.whatsapp),
    categoriaTicket: achar(ALIASES.categoriaTicket),
  };
  if (!col.email) throw new Error("Não encontrei a coluna de e-mail na planilha.");

  const dias = new Map<number, string>();
  for (const c of cabecalhos) {
    const d = diaDaColuna(c);
    if (d && !dias.has(d)) dias.set(d, c);
  }
  const usadas = new Set<string>([...Object.values(col), ...dias.values()].filter((c): c is string => !!c));

  const porEmail = new Map<string, InscritoDaPlanilha>();
  let descartados = 0;
  for (const linha of linhas) {
    const email = normalizarEmail(texto(linha[col.email]));
    if (!email.includes("@")) {
      descartados++;
      continue;
    }
    const extras: Record<string, unknown> = {};
    for (const c of cabecalhos) {
      if (!usadas.has(c) && !vazio(linha[c])) extras[chave(c)] = String(linha[c]).trim();
    }
    const dia = (d: number) => (dias.has(d) ? marcado(linha[dias.get(d)!]) : false);
    porEmail.set(email, {
      email,
      nome: (col.nome && texto(linha[col.nome])) || email,
      whatsapp: col.whatsapp ? texto(linha[col.whatsapp]) : null,
      categoriaTicket: col.categoriaTicket ? texto(linha[col.categoriaTicket]) : null,
      d1: dia(1),
      d2: dia(2),
      d3: dia(3),
      extras,
    });
  }
  return { inscritos: [...porEmail.values()], descartados, temPresenca: dias.size > 0 };
}

/**
 * Linha pronta para o upsert em `inscritos`. Sempre as mesmas colunas, para
 * o upsert em lote não zerar nada: classe, nota e o resto do Lead Score não
 * entram aqui, então quem já existe fica com o que o painel deu.
 */
export function linhaParaGravar(
  eventoId: string,
  novo: InscritoDaPlanilha,
  existente: InscritoExistente | undefined,
  temPresenca: boolean,
  agora: string
) {
  const d1 = temPresenca ? novo.d1 : existente?.d1 ?? false;
  const d2 = temPresenca ? novo.d2 : existente?.d2 ?? false;
  const d3 = temPresenca ? novo.d3 : existente?.d3 ?? false;
  return {
    evento_id: eventoId,
    email: novo.email,
    nome: novo.nome,
    whatsapp: novo.whatsapp ?? existente?.whatsapp ?? null,
    categoria_ticket: novo.categoriaTicket ?? existente?.categoria_ticket ?? null,
    checkin_feito: temPresenca ? d1 || d2 || d3 : existente?.checkin_feito ?? false,
    d1,
    d2,
    d3,
    extras: { ...(existente?.extras ?? {}), ...novo.extras },
    importado_em: agora,
  };
}
