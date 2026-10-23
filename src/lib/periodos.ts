import type { Inscrito } from "./analise";

// ─────────────────────────────────────────────────────────────────────────
// Presença por período (manhã / tarde), como no painel de Lead Score.
//
// O credenciamento registra o check-in por turno ("Check-in D2 Manhã",
// "Check-in D2 Tarde"…). O painel guarda isso em `extras.sessoes`
// ({ d1m, d1t, d2m, d2t, d3m, d3t } com "Sim" / "Não" / "Sem turno"); a
// planilha traz as mesmas colunas e a importação monta o mesmo objeto.
//
// O D1 conta como dia inteiro: no 1º dia o check-in foi feito sem turno.
// Cada número sai com uma frase curta dizendo o que ele conta — é o que o
// time lê no salão para não confundir "só tarde" com "novo à tarde".
// ─────────────────────────────────────────────────────────────────────────

export type Turno = "d1m" | "d1t" | "d2m" | "d2t" | "d3m" | "d3t";

const SIM = (v: unknown) => String(v ?? "").trim().toLowerCase() === "sim";

/** Veio naquele turno (check-in registrado com "Sim"). */
export function noTurno(i: Inscrito, t: Turno): boolean {
  const s = i.extras.sessoes as Record<string, unknown> | undefined;
  return SIM(s?.[t]);
}

/** A base tem check-in por turno para alguém? Sem isso, a seção nem aparece. */
export function temTurnos(lista: Inscrito[]): boolean {
  return lista.some((i) => (["d1m", "d1t", "d2m", "d2t", "d3m", "d3t"] as Turno[]).some((t) => noTurno(i, t)));
}

export type Recorte = {
  chave: string;
  label: string;
  descricao: string;
  /** Dia a que o recorte se refere: some da tela enquanto o dia não tem ninguém. */
  dia: 1 | 2 | 3;
  grupo: "periodo" | "combinacao" | "novos" | "total";
  teste: (i: Inscrito) => boolean;
};

const m2 = (i: Inscrito) => noTurno(i, "d2m");
const t2 = (i: Inscrito) => noTurno(i, "d2t");
const m3 = (i: Inscrito) => noTurno(i, "d3m");
const t3 = (i: Inscrito) => noTurno(i, "d3t");

export const RECORTES: Recorte[] = [
  // Períodos
  { chave: "p_d1", label: "D1 (dia inteiro)", dia: 1, grupo: "periodo",
    descricao: "Fez check-in no 1º dia (o D1 não teve turno).", teste: (i) => i.d1 },
  { chave: "p_d2m", label: "D2 manhã", dia: 2, grupo: "periodo",
    descricao: "Fez check-in na manhã do 2º dia.", teste: m2 },
  { chave: "p_d2t", label: "D2 tarde", dia: 2, grupo: "periodo",
    descricao: "Fez check-in na tarde do 2º dia (tenha vindo de manhã ou não).", teste: t2 },
  { chave: "p_d3m", label: "D3 manhã", dia: 3, grupo: "periodo",
    descricao: "Fez check-in na manhã do 3º dia.", teste: m3 },
  { chave: "p_d3t", label: "D3 tarde", dia: 3, grupo: "periodo",
    descricao: "Fez check-in na tarde do 3º dia (tenha vindo de manhã ou não).", teste: t3 },

  // Totais de pessoas únicas
  { chave: "t_d12", label: "Total D1 + D2 (pessoas únicas)", dia: 2, grupo: "total",
    descricao: "Quantas pessoas diferentes vieram no D1 ou no D2. Quem veio nos dois conta uma vez.",
    teste: (i) => i.d1 || i.d2 },
  { chave: "t_d123", label: "Total do evento (pessoas únicas)", dia: 3, grupo: "total",
    descricao: "Quantas pessoas diferentes vieram em pelo menos um dos 3 dias.",
    teste: (i) => i.d1 || i.d2 || i.d3 },

  // Combinações do D2
  { chave: "c_d2mt", label: "D2 manhã e tarde", dia: 2, grupo: "combinacao",
    descricao: "Ficou o 2º dia inteiro: check-in de manhã e à tarde.", teste: (i) => m2(i) && t2(i) },
  { chave: "c_d2m", label: "D2 só manhã (saiu)", dia: 2, grupo: "combinacao",
    descricao: "Veio de manhã no 2º dia e não voltou à tarde.", teste: (i) => m2(i) && !t2(i) },
  { chave: "c_d2t", label: "D2 só tarde", dia: 2, grupo: "combinacao",
    descricao: "Chegou só à tarde no 2º dia (sem check-in de manhã). Inclui quem já tinha vindo no D1.",
    teste: (i) => t2(i) && !m2(i) },
  { chave: "c_d1d2", label: "D1 e D2", dia: 2, grupo: "combinacao",
    descricao: "Esteve nos dois primeiros dias, em qualquer período.", teste: (i) => i.d1 && i.d2 },
  { chave: "c_d1so", label: "D1 e não voltou no D2", dia: 2, grupo: "combinacao",
    descricao: "Veio no 1º dia e não fez check-in no 2º.", teste: (i) => i.d1 && !i.d2 },

  // Novos no D2
  { chave: "n_d2", label: "Novos no D2", dia: 2, grupo: "novos",
    descricao: "Vieram no 2º dia sem ter vindo no D1 (qualquer período).", teste: (i) => i.d2 && !i.d1 },
  { chave: "n_d2m", label: "Novos no D2 manhã", dia: 2, grupo: "novos",
    descricao: "Primeira vez no evento foi a manhã do 2º dia.", teste: (i) => m2(i) && !i.d1 },
  { chave: "n_d2t", label: "Novos no D2 tarde", dia: 2, grupo: "novos",
    descricao: "Primeira vez no evento foi a tarde do 2º dia: não veio no D1 nem na manhã do D2.",
    teste: (i) => t2(i) && !m2(i) && !i.d1 },

  // Combinações do D3
  { chave: "c_d3mt", label: "D3 manhã e tarde", dia: 3, grupo: "combinacao",
    descricao: "Ficou o 3º dia inteiro: check-in de manhã e à tarde.", teste: (i) => m3(i) && t3(i) },
  { chave: "c_d3m", label: "D3 só manhã (saiu)", dia: 3, grupo: "combinacao",
    descricao: "Veio de manhã no 3º dia e não voltou à tarde.", teste: (i) => m3(i) && !t3(i) },
  { chave: "c_d3t", label: "D3 só tarde", dia: 3, grupo: "combinacao",
    descricao: "Chegou só à tarde no 3º dia (sem check-in de manhã).", teste: (i) => t3(i) && !m3(i) },
  { chave: "c_d2d3", label: "D2 e D3", dia: 3, grupo: "combinacao",
    descricao: "Esteve no 2º e no 3º dia, em qualquer período.", teste: (i) => i.d2 && i.d3 },
  { chave: "c_3dias", label: "Os 3 dias", dia: 3, grupo: "combinacao",
    descricao: "Fez check-in nos três dias.", teste: (i) => i.d1 && i.d2 && i.d3 },

  // Novos no D3
  { chave: "n_d3", label: "Novos no D3", dia: 3, grupo: "novos",
    descricao: "Vieram no 3º dia sem ter vindo no D1 nem no D2.", teste: (i) => i.d3 && !i.d1 && !i.d2 },
  { chave: "n_d3m", label: "Novos no D3 manhã", dia: 3, grupo: "novos",
    descricao: "Primeira vez no evento foi a manhã do 3º dia.", teste: (i) => m3(i) && !i.d1 && !i.d2 },
  { chave: "n_d3t", label: "Novos no D3 tarde", dia: 3, grupo: "novos",
    descricao: "Primeira vez no evento foi a tarde do 3º dia: não veio no D1, no D2 nem na manhã do D3.",
    teste: (i) => t3(i) && !m3(i) && !i.d1 && !i.d2 },
];

export const GRUPOS: { grupo: Recorte["grupo"]; titulo: string }[] = [
  { grupo: "periodo", titulo: "Por período" },
  { grupo: "total", titulo: "Totais" },
  { grupo: "combinacao", titulo: "Combinações" },
  { grupo: "novos", titulo: "Novos (primeira vez no evento)" },
];

export type LinhaRecorte = Omit<Recorte, "teste"> & { n: number; pct: number };

/**
 * Os recortes com número e % sobre o total de presentes únicos do evento.
 * Dia sem ninguém ainda (ex.: D3 antes de acontecer) fica de fora.
 */
export function resumoPeriodos(lista: Inscrito[]): { presentes: number; linhas: LinhaRecorte[] } {
  const presentes = lista.filter((i) => i.d1 || i.d2 || i.d3).length;
  const diaTemGente = (d: number) => lista.some((i) => (d === 1 ? i.d1 : d === 2 ? i.d2 : i.d3));
  const linhas = RECORTES.filter((r) => diaTemGente(r.dia)).map(({ teste, ...r }) => {
    const n = lista.filter(teste).length;
    return { ...r, n, pct: presentes ? Math.round((n / presentes) * 1000) / 10 : 0 };
  });
  return { presentes, linhas };
}

export function filtrarRecorte(lista: Inscrito[], chave: string): Inscrito[] {
  const r = RECORTES.find((x) => x.chave === chave);
  return r ? lista.filter(r.teste) : lista;
}
