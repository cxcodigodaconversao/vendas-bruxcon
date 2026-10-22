import type { Faixa, Papel, Produto, Regra } from "./types";

// ─────────────────────────────────────────────────────────────────────────
// O que este arquivo NÃO tem mais (e por quê):
//   · EMAIL_MAP  → virou a coleção `usuarios` (gerida pela tela de usuários)
//   · CLOSERS    → virou a equipe do evento (eventos/{id}/equipe)
//   · FAIXA_LABELS / getPts → viraram configuração do evento
// Sobraram os formatadores e os PADRÕES usados ao criar um evento novo.
// ─────────────────────────────────────────────────────────────────────────

export const fmtVal = (v: number) =>
  "R$ " + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const fmtValExato = (v: number) =>
  "R$ " + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtPts = (n: number) => (n % 1 === 0 ? n.toString() : n.toFixed(1).replace(".", ","));

/** Data pura do banco (YYYY-MM-DD). O meio-dia evita o fuso puxar para o dia anterior. */
export const fmtData = (iso: string | null) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("pt-BR") : "";

/** Hora de um timestamptz (criado_em). */
export const fmtHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";

export const PAPEL_LABEL = {
  admin: "Administrador",
  gestor: "Gestor",
  closer: "Vendedor",
  promotor: "Promotor",
} as const;

/**
 * Quem enxerga números agregados (ranking, totais do evento, meta).
 * O promotor lê a venda de todo mundo, mas fica fora da disputa: para ele,
 * a tela mostra o valor de cada contrato e nenhuma soma.
 */
export const veAgregados = (papel: Papel) => papel === "admin" || papel === "gestor";

/** Quem lê as vendas do evento inteiro — inclui o promotor. */
export const leTodasAsVendas = (papel: Papel) =>
  papel === "admin" || papel === "gestor" || papel === "promotor";

/** Quem coordena: edita venda alheia, corrige lead, mexe na equipe. */
export const coordena = (papel: Papel) => papel === "admin" || papel === "gestor";

/**
 * Cor do app quando nenhum projeto está selecionado (login, tela de escolha).
 * Com projeto escolhido, `--brand` passa a ser `projeto.cor`.
 */
export const COR_BRUXCON = "#0A1A0F";

/** Versão fraca (fundo de chip) de uma cor #RRGGBB. */
export function corFraca(hex: string, alfa = 0.1) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}

// ── Padrões de um evento novo ───────────────────────────────────────────
// Hoje os padrões vêm do PROJETO (projetos.produtos/faixas/regras). Os
// valores abaixo são os do DTC Master e ficam como reserva: se um projeto
// for cadastrado sem configuração, o evento não nasce vazio.

export const FAIXAS_PADRAO: Faixa[] = [
  { label: "Abaixo de R$ 15.000", min: 0, max: 14999.99 },
  { label: "R$ 15.000 até R$ 29.996", min: 15000, max: 29996.99 },
  { label: "Acima de R$ 29.997", min: 29997 },
];

export const PRODUTOS_PADRAO: Produto[] = [{ id: "dtc-master", nome: "DTC Master" }];

export const REGRAS_PADRAO: Regra[] = [
  {
    id: "base",
    label: "Ponto recorrente (base)",
    tag: "1",
    pontos: 1,
    tipo: "base",
    ativo: true,
  },
  {
    id: "faixa-alta",
    label: "Recebido acima de R$ 15.000",
    tag: "+1",
    pontos: 1,
    tipo: "condicao",
    condicoes: [{ campo: "faixaIndex", op: ">=", valor: 1 }],
    ativo: true,
  },
  {
    id: "completo",
    label: "Recebimento completo",
    tag: "+1",
    pontos: 1,
    tipo: "condicao",
    condicoes: [{ campo: "completo", op: "é", valor: true }],
    ativo: true,
  },
  {
    id: "segunda-cadeira",
    label: "2ª cadeira incluída",
    tag: "+½",
    pontos: 0.5,
    tipo: "condicao",
    condicoes: [{ campo: "cadeira", op: "é", valor: true }],
    ativo: true,
  },
];
