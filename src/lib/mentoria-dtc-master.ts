// ─────────────────────────────────────────────────────────────────────────
// O que a mentoria DTC Master entrega — base fixa do analisador de
// abordagens (aba Abordagens → Gerar análise).
//
// No app da Cris Miura este texto veio dos materiais de venda (pitch e
// planilha) e vale para toda a equipe. Para o DTC Master ainda não temos
// esses materiais, então a base começa VAZIA de propósito: a IA não pode
// inventar entregável. Enquanto estiver vazia, a análise usa o que a equipe
// escrever na tela (fica salvo no aparelho) e, sem isso, fala da mentoria
// só em termos gerais.
//
// Para fixar: colar aqui o que a mentoria entrega (para quem é, como
// funciona, o que o aluno recebe, garantia), só com o que está confirmado.
// ─────────────────────────────────────────────────────────────────────────

export const MENTORIA_BASE = "";

/** Nome da oferta, como a IA e a tela se referem a ela. */
export const NOME_DA_MENTORIA = "mentoria DTC Master";

/** O que a IA não pode afirmar enquanto não houver confirmação. Vai no prompt. */
export const NAO_CONFIRMADO = [
  "a duração da mentoria",
  "o preço, o valor das parcelas ou a forma de pagamento",
  "quantos encontros são diretamente com o(a) mentor(a)",
];
