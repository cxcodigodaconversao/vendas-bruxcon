// ─────────────────────────────────────────────────────────────────────────
// O que a mentoria DTC Master entrega — base fixa do analisador de
// abordagens (aba Abordagens → Gerar análise). Vale para toda a equipe.
//
// Tirado da apresentação da oferta ("PPT - DTC MASTER", 73 slides) que o
// Everton enviou em 20/11/2026.
//
// PREÇO: os slides mostram 12x R$ 4.997 / R$ 53.967 e 12x R$ 3.997 /
// R$ 39.997, que estão ERRADOS. O valor real, confirmado pelo Everton em
// 20/11/2026, é 12x de R$ 2.997 (R$ 35.964) ou R$ 29.997 à vista.
//
// Ficaram de fora DE PROPÓSITO as datas da turma do slide (encontros em
// maio/2026, outubro/2026 e março/2027; Bruxcon julho/2026): já passaram ou
// podem mudar a cada turma. A IA é proibida de citar datas.
// ─────────────────────────────────────────────────────────────────────────

export const MENTORIA_BASE = `Nome: DTC Master Bruxismo, da Dra. Andréa Melo com a SIBX (Sociedade Internacional de Bruxismo).

O que é: programa completo de acompanhamento com implementação personalizada e individualizada do segmento Bruxismo (bruxismo, ronco e apneia) no consultório do dentista. Rota "do zero ao R$ 1 milhão por ano": aumento previsível do ticket médio, segurança clínica para diagnósticos complexos, qualidade de vida e menos tempo clínico.

Para quem é: dentista que quer aumentar o faturamento com tratamentos de bruxismo, ronco e apneia e sair da "odontologia de esperança" (insegurança clínica, medo de errar no diagnóstico, agenda cheia e conta vazia, rotina apagando incêndio de urgência e dor). "Trabalhar muito não é sinônimo de faturar bem."

Os 4 pilares:
1. Direcionamento estratégico (não é só clínica, é negócio): check-up completo do negócio, planejamento trimestral de negócio e vendas (a cada 90 dias), implementação das 7 formas de aumento de faturamento, treinamento mensal de vendas, treinamento para secretária, scripts de vendas validados (o time desenvolve sob demanda).
2. Acompanhamento personalizado, o pilar central ("você nunca mais estará sozinho no mocho"): 12 análises de casos clínicos (pré e pós diagnóstico, tratamento e controle), 3 análises de casos individuais com a Dra. Andréa Melo, 6 reuniões estratégicas para qualquer dúvida no processo, 4 sessões de treinamento individualizado para o dentista ou o time (régua de Gauge, articulador, placas de avanço, placas personalizadas, gestão de crise de dor, diagnóstico diferencial), plantão de dúvidas semanal ao vivo com mentores SIBX, CS exclusivo (secretária particular no WhatsApp, resposta em até 24h úteis).
3. Organização e ferramentas inteligentes: DP4.app (prontuário 360º online, licença anual), Master Drive (gravações, pastas dos pacientes, planilhas, scripts, fluxos de atendimento, modelos de campanhas), SNA (Sistema de Navegação Avançada: rotas de tratamento, de terapias complementares e de áreas médicas relacionadas), Lucy IA (copiloto clínico, análise de exames, planejamento), SIBX Academy (plataforma online).
4. Inteligência coletiva e prática: 3 encontros presenciais hands-on de 2 dias (6 dias de prática com pacientes reais, atendimento supervisionado, confecção de placas, gestão de crise de dor), arsenal técnico de placas (diurna, Michigan, transitória, avanço mandibular), terapias complementares (agulhamento seco, bloqueio anestésico diagnóstico, laserterapia, TENS), grupo exclusivo no Telegram com hot seats, BruxCare (mapa oficial de indicação de membros certificados), clube de vantagens SIBX Partners.

Bônus de quem entra na turma: 1 ano como Membro Master da Sociedade Internacional de Bruxismo com certificado físico, 1 ingresso Master para o Bruxcon (Congresso Internacional de Bruxismo), acesso aos 11 cursos online enquanto ativo no Master, Desafio de 40 dias e bootcamps de implementação, Pós-Graduação Lato Sensu em Bruxismo, Ronco e Apneia (certificação MEC, 360 h, sem prazo para concluir enquanto ativo), Lucy IA com 10 mini agentes.

Investimento (confirmado): 12x de R$ 2.997 (R$ 35.964) ou R$ 29.997 à vista. Valor total percebido apresentado: R$ 100.079. "1 tratamento de bruxismo por mês paga a parcela."

Garantia de resultado (condicional): quem cumprir o protocolo de 12 meses (check-up de negócio, 4 planejamentos trimestrais aplicados, 6 das 12 análises, 1 das 3 análises com a Dra. Andréa, 2 dos 4 treinamentos, presença nos 3 encontros) e não recuperar o investimento ganha mais 3 meses de mentoria individual com a Dra. Andréa; se ainda assim o resultado não vier, recebe todo o investimento de volta + R$ 10.000.`;

/** Nome da oferta, como a IA e a tela se referem a ela. */
export const NOME_DA_MENTORIA = "mentoria DTC Master";

/** O que a IA não pode afirmar. Vai no prompt. */
export const NAO_CONFIRMADO = [
  "datas de encontros presenciais, do Bruxcon ou de início e fim da turma",
  "qualquer preço, parcela ou desconto diferente de 12x de R$ 2.997 (R$ 35.964) ou R$ 29.997 à vista",
];
