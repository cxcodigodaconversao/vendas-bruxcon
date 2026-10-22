import { describe, expect, it } from "vitest";
import { normalizarLinha } from "./analise";
import type { Abordagem } from "./types";
import {
  abordagensPorEmail,
  abordagensPorMembro,
  filtrarDia,
  resumoDias,
  contarPorClasse,
  filtrarClasse,
  camposDisponiveis,
  detalhesDe,
  fichaDoInscrito,
  filtrarResposta,
  valoresDoCampo,
  ehAluno,
  estaPresente,
  filtrarAluno,
  filtrarParticipantes,
  filtrarPresenca,
  resumoPresenca,
  rotulosPresenca,
  linkInstagram,
  linkWhatsapp,
  ordenarParticipantes,
  placarDeAbordagens,
  semAcento,
} from "./participantes";

const p = (over: Record<string, unknown> = {}) =>
  normalizarLinha({
    nome: "José da Conceição",
    email: "jose@exemplo.com",
    whatsapp: "5531987818683",
    classe: "AA",
    nota: 90,
    instagram: "tupynambaodontologia",
    cro: "MG 23926",
    ...over,
  })!;

describe("semAcento", () => {
  it("tira acento e caixa", () => {
    expect(semAcento("  José DA Conceição ")).toBe("jose da conceicao");
  });
});

describe("filtrarParticipantes", () => {
  const lista = [
    p(),
    p({ nome: "Ana Paula Silva", email: "ana@x.com", whatsapp: "(31) 99999-1234", instagram: null }),
    p({ nome: "Ana Beatriz Souza", email: "beatriz@x.com", whatsapp: null, instagram: null }),
  ];

  it("acha mesmo digitando sem acento", () => {
    expect(filtrarParticipantes(lista, "jose").map((i) => i.nome)).toEqual(["José da Conceição"]);
    expect(filtrarParticipantes(lista, "CONCEICAO")).toHaveLength(1);
  });

  it("exige todas as palavras, não qualquer uma", () => {
    expect(filtrarParticipantes(lista, "ana")).toHaveLength(2);
    expect(filtrarParticipantes(lista, "ana silva").map((i) => i.nome)).toEqual(["Ana Paula Silva"]);
  });

  it("busca por e-mail, instagram e telefone com ou sem máscara", () => {
    expect(filtrarParticipantes(lista, "beatriz@x.com")).toHaveLength(1);
    expect(filtrarParticipantes(lista, "tupynamba")).toHaveLength(1);
    expect(filtrarParticipantes(lista, "31999991234")).toHaveLength(1);
  });

  it("termo vazio devolve a lista inteira", () => {
    expect(filtrarParticipantes(lista, "   ")).toHaveLength(3);
  });
});

describe("presença e aluno", () => {
  const lista = [
    p({ email: "a@x", checkin_feito: true, d1: true, d2: true, ja_aluno: "Sim" }),
    p({ email: "b@x", checkin_feito: true, d1: false, d2: false, d3: true, ja_aluno: "Não" }),
    p({ email: "c@x", checkin_feito: false, d1: false, d2: false, d3: false, ja_aluno: null }),
    p({ email: "d@x", checkin_feito: true, d1: false, d2: false, d3: false, ja_aluno: null }),
  ];

  it("um selo por dia presente, na ordem dos dias", () => {
    expect(rotulosPresenca(lista[0])).toEqual(["Presente 1º dia", "Presente 2º dia"]);
    expect(rotulosPresenca(lista[1])).toEqual(["Presente 3º dia"]);
    expect(rotulosPresenca(lista[2])).toEqual([]);
  });

  it("check-in sem dia marcado ainda conta como presente", () => {
    expect(rotulosPresenca(lista[3])).toEqual(["Presente"]);
    expect(estaPresente(lista[3])).toBe(true);
    expect(estaPresente(lista[2])).toBe(false);
  });

  it("filtra presentes e alunos, combináveis", () => {
    expect(filtrarPresenca(lista, "presentes").map((i) => i.email)).toEqual(["a@x", "b@x", "d@x"]);
    expect(filtrarPresenca(lista, "todos")).toHaveLength(4);
    expect(filtrarAluno(lista, "alunos").map((i) => i.email)).toEqual(["a@x"]);
    // quem não respondeu (c, d) não é aluno nem não aluno
    expect(filtrarAluno(lista, "nao_alunos").map((i) => i.email)).toEqual(["b@x"]);
    expect(filtrarAluno(filtrarPresenca(lista, "presentes"), "nao_alunos").map((i) => i.email)).toEqual(["b@x"]);
    expect(ehAluno(lista[0])).toBe(true);
  });

  it("resume presentes por dia abrindo aluno / não aluno", () => {
    const r = resumoPresenca(lista);
    expect(r.presentes).toBe(3);
    expect(r.alunos).toBe(1);
    expect(r.naoAlunos).toBe(1);
    expect(r.semResposta).toBe(1);
    expect(r.porDia).toEqual([
      { dia: 1, n: 1, alunos: 1, naoAlunos: 0, semResposta: 0 },
      { dia: 2, n: 1, alunos: 1, naoAlunos: 0, semResposta: 0 },
      { dia: 3, n: 1, alunos: 0, naoAlunos: 1, semResposta: 0 },
    ]);
  });
});

describe("filtrarClasse", () => {
  const lista = [p({ email: "a@x", classe: "AA" }), p({ email: "b@x", classe: "B" }), p({ email: "x@x", classe: "X", nota: null })];
  it("vazio = todas; com seleção, só as marcadas", () => {
    expect(filtrarClasse(lista, new Set())).toHaveLength(3);
    expect(filtrarClasse(lista, new Set(["AA", "B"] as const)).map((i) => i.email)).toEqual(["a@x", "b@x"]);
  });
  it("conta por classe, com zero nas ausentes", () => {
    const c = contarPorClasse(lista);
    expect(c.AA).toBe(1);
    expect(c.B).toBe(1);
    expect(c.X).toBe(1);
    expect(c.F).toBe(0);
  });
});

describe("linkWhatsapp", () => {
  it("acrescenta o 55 quando falta e limpa a máscara", () => {
    expect(linkWhatsapp("(31) 98781-8683")).toBe("https://wa.me/5531987818683");
    expect(linkWhatsapp("3132221234")).toBe("https://wa.me/553132221234");
  });

  it("mantém número que já tem DDI", () => {
    expect(linkWhatsapp("5531987818683")).toBe("https://wa.me/5531987818683");
  });

  it("devolve null para vazio ou número curto demais", () => {
    expect(linkWhatsapp(null)).toBeNull();
    expect(linkWhatsapp("98781")).toBeNull();
  });
});

describe("linkInstagram", () => {
  it("aceita usuário, @usuario e URL completa", () => {
    expect(linkInstagram("perfil.teste")).toBe("https://instagram.com/perfil.teste");
    expect(linkInstagram("@perfil")).toBe("https://instagram.com/perfil");
    expect(linkInstagram("https://www.instagram.com/perfil/?hl=pt")).toBe("https://instagram.com/perfil");
  });

  it("devolve null para vazio ou lixo", () => {
    expect(linkInstagram(null)).toBeNull();
    expect(linkInstagram("não tenho")).toBeNull();
  });
});

describe("ordenarParticipantes", () => {
  it("melhor classe primeiro, depois maior nota", () => {
    const lista = [
      p({ nome: "C1", email: "c@x", classe: "C", nota: 60 }),
      p({ nome: "AA baixo", email: "a1@x", classe: "AA", nota: 80 }),
      p({ nome: "AA alto", email: "a2@x", classe: "AA", nota: 95 }),
      p({ nome: "Sem nota", email: "x@x", classe: "X", nota: null }),
    ];
    expect(ordenarParticipantes(lista).map((i) => i.nome)).toEqual(["AA alto", "AA baixo", "C1", "Sem nota"]);
  });
});

describe("detalhesDe", () => {
  it("mostra só os extras preenchidos, na ordem definida", () => {
    const d = detalhesDe(p({ setor: "Clínica", acompanhante: "Sim, vou levar", comentario: "" }));
    expect(d.map((x) => x.label)).toEqual(["Setor", "Vai levar acompanhante"]);
    expect(d[0].valor).toBe("Clínica");
  });

  it("junta lista em texto e traduz booleano", () => {
    const d = detalhesDe(p({ cro: null, categoria: ["Aluno", "VIP"], acompanhante: true }));
    expect(d.find((x) => x.label === "Categoria")?.valor).toBe("Aluno, VIP");
    expect(d.find((x) => x.label === "Vai levar acompanhante")?.valor).toBe("Sim");
  });
});

const ab = (porNome: string, email: string, em = "2026-09-04T10:00:00Z"): Abordagem => ({
  id: Math.random().toString(36).slice(2),
  email,
  usuarioId: "u1",
  porNome,
  observacao: "conversamos",
  em,
});

describe("placarDeAbordagens", () => {
  it("conta PESSOAS distintas, não registros", () => {
    const p = placarDeAbordagens([
      ab("Bruna", "a@x"),
      ab("Bruna", "a@x"), // mesma lead de novo
      ab("Bruna", "b@x"),
      ab("Mila", "c@x"),
    ]);
    expect(p[0]).toEqual({ nome: "Bruna", pessoas: 2, registros: 3 });
    expect(p[1]).toEqual({ nome: "Mila", pessoas: 1, registros: 1 });
  });

  it("ordena por pessoas e desempata por nome", () => {
    const p = placarDeAbordagens([ab("Zoe", "a@x"), ab("Ana", "b@x")]);
    expect(p.map((x) => x.nome)).toEqual(["Ana", "Zoe"]);
  });

  it("lista vazia devolve placar vazio", () => {
    expect(placarDeAbordagens([])).toEqual([]);
  });
});

describe("abordagensPorEmail", () => {
  it("agrupa por lead com a mais recente primeiro", () => {
    const m = abordagensPorEmail([
      ab("Bruna", "a@x", "2026-09-01T10:00:00Z"),
      ab("Mila", "a@x", "2026-09-04T10:00:00Z"),
      ab("Mila", "b@x"),
    ]);
    expect(m.get("a@x")!.map((a) => a.porNome)).toEqual(["Mila", "Bruna"]);
    expect(m.get("b@x")).toHaveLength(1);
  });
});

describe("filtro e resumo por dia", () => {
  const lista = [
    p({ email: "a@x", checkin_feito: true, d1: true, d2: false, d3: false }),
    p({ email: "b@x", checkin_feito: true, d1: true, d2: true, d3: false }),
    p({ email: "c@x", checkin_feito: true, d1: false, d2: true, d3: true }),
    p({ email: "d@x", checkin_feito: true, d1: true, d2: true, d3: true }),
    p({ email: "e@x", checkin_feito: false, d1: false, d2: false, d3: true }),
    p({ email: "f@x", checkin_feito: true, d1: false, d2: false, d3: false }),
    p({ email: "g@x", checkin_feito: false, d1: false, d2: false, d3: false }),
  ];
  const emails = (l: { email: string }[]) => l.map((i) => i.email);

  it("'esteve no dia' traz quem passou naquele dia, qualquer combinação", () => {
    expect(emails(filtrarDia(lista, "d1"))).toEqual(["a@x", "b@x", "d@x"]);
    expect(emails(filtrarDia(lista, "d3"))).toEqual(["c@x", "d@x", "e@x"]);
  });

  it("combinação é exata", () => {
    expect(emails(filtrarDia(lista, "so1"))).toEqual(["a@x"]);
    expect(emails(filtrarDia(lista, "so3"))).toEqual(["e@x"]);
    expect(emails(filtrarDia(lista, "d12"))).toEqual(["b@x"]);
    expect(emails(filtrarDia(lista, "d23"))).toEqual(["c@x"]);
    expect(emails(filtrarDia(lista, "d123"))).toEqual(["d@x"]);
    expect(filtrarDia(lista, "todos")).toHaveLength(7);
  });

  it("porcentagens sobre quem tem dia; combinações somam 100%", () => {
    const r = resumoDias(lista);
    expect(r.comDia).toBe(5);
    expect(r.semDia).toBe(1);
    expect(r.porDia.map((d) => d.n)).toEqual([3, 3, 3]);
    expect(r.porDia[0].pct).toBe(60);
    const so1 = r.combinacoes.find((c) => c.chave === "so1")!;
    expect(so1).toMatchObject({ n: 1, pct: 20 });
    expect(r.combinacoes.reduce((s, c) => s + c.n, 0)).toBe(5);
    expect(r.combinacoes.reduce((s, c) => s + c.pct, 0)).toBeCloseTo(100);
  });
});

describe("abordagensPorMembro", () => {
  const ab = (id: string, email: string, porNome: string, em: string, observacao = "obs " + id): Abordagem => ({
    id, email, usuarioId: null, porNome, observacao, em,
  });
  const inscritos = [p({ email: "lead1@x", nome: "Lead Um" }), p({ email: "lead2@x", nome: "Lead Dois", classe: "B" })];

  it("abre cada membro em leads e conversas, mais recentes primeiro", () => {
    const r = abordagensPorMembro(
      [
        ab("1", "lead1@x", "Bruna", "2026-10-01T10:00:00Z"),
        ab("2", "lead2@x", "Bruna", "2026-10-01T12:00:00Z"),
        ab("3", "lead1@x", "Bruna", "2026-10-02T09:00:00Z"),
        ab("4", "fora@x", "Carlos", "2026-10-01T11:00:00Z"),
      ],
      inscritos
    );
    expect(r.map((m) => m.nome)).toEqual(["Bruna", "Carlos"]);
    expect(r[0].leads.map((l) => l.nome)).toEqual(["Lead Um", "Lead Dois"]);
    expect(r[0].leads[0].registros.map((a) => a.id)).toEqual(["3", "1"]);
    expect(r[0].leads[1].classe).toBe("B");
    expect(r[1].leads[0]).toMatchObject({ nome: "fora@x", classe: null });
  });
});

/** Linha no formato do painel de Lead Score do IMBX (index.html). */
const imbx = (over: Record<string, unknown> = {}) =>
  p({
    classe: "AA",
    nota: 98.8,
    tipo: "completo",
    genero: "Feminino",
    genero_inferido: true,
    area_atuacao: "Prótese",
    faturamento: "De 201 mil a 300 mil reais no ano",
    estado: "Alagoas",
    curso: "Sou aluno(a) do Bruxismo do Zero ao avançado",
    convidado_por: "---",
    interesse: "Placas de Michigan",
    confirmou_form: true,
    aluno_form: true,
    tags_origem: "Google Forms, CRM Clint",
    campanha: "[IMBX_BH_Outubro]_[FB]",
    utm_source: "Instagram_Stories",
    criativo: "FEED_1.png",
    cro: "43024",
    cro_valido: true,
    inscricao_em: "14/07/2026",
    comprou_ingresso: true,
    valor_compra: "297.00",
    metodo_pag: "Pix",
    data_compra: "02/08/2026 12:50:29",
    sessoes: { d1m: "Sim", d1t: "Não", d2m: "Não", d2t: "Sim", d3m: "Não", d3t: "Não" },
    nps: ["Sim", "Não", "Não"],
    ja_aluno: "Sim",
    categoria_ticket: "Aluno(a)",
    pre_checkin: "Confirmado",
    checkin_feito: true,
    d1: true,
    eticket: "4822311006457619574",
    pts: { genero: 10, idade: null, especialidade: 15 },
    pesos: { genero: 10, idade: 15, especialidade: 15 },
    rank: 1,
    campo_novo: "valor novo",
    ...over,
  });

describe("fichaDoInscrito", () => {
  const secao = (titulo: string, over?: Record<string, unknown>) =>
    Object.fromEntries(
      (fichaDoInscrito(imbx(over)).find((s) => s.titulo === titulo)?.linhas ?? []).map((l) => [l.label, l.valor])
    );

  it("mostra as respostas do formulário do painel", () => {
    const perfil = secao("Perfil e respostas");
    expect(perfil).toMatchObject({
      Gênero: "Feminino (pelo nome)",
      Especialidade: "Prótese",
      Estado: "Alagoas",
      CRO: "válido · nº 43024",
      Curso: "Sou aluno(a) do Bruxismo do Zero ao avançado",
      "Quer aprender": "Placas de Michigan",
      "Já é aluno(a)": "Sim",
    });
    expect(perfil).not.toHaveProperty("Convidado por"); // "---" é vazio
  });

  it("abre a nota por componente com o peso", () => {
    expect(secao("Composição da nota")).toMatchObject({
      Situação: "completo",
      "Posição na fila": "1º",
      Gênero: "10 / 10",
      "Idade 45+": "sem dado",
      "Especialidade top 4": "15 / 15",
    });
    expect(secao("Composição da nota", { cro_valido: false }).Observação).toMatch(/× 0,8/);
  });

  it("traz presença, sessões, NPS, origem e compra na Hotmart", () => {
    expect(secao("Ingresso e presença")).toMatchObject({
      Ingresso: "Aluno(a)",
      "Pré-checkin": "Confirmado",
      "Confirmou os 3 dias no formulário": "Sim",
      Sessões: "D1 manhã · D2 tarde",
      "Respondeu NPS": "D1",
      eTicket: "4822311006457619574",
    });
    expect(secao("Origem e histórico")).toMatchObject({
      Inscrição: "14/07/2026",
      Posicionamento: "Instagram_Stories",
      "Comprou ingresso na Hotmart": "Sim · R$ 297.00 · Pix · 02/08/2026 12:50:29",
    });
  });

  it("campo novo do painel não se perde: vai para Outras respostas", () => {
    expect(secao("Outras respostas")).toEqual({ "Campo novo": "valor novo" });
  });
});

describe("filtro por resposta", () => {
  const base = [imbx(), imbx({ email: "b@x.com", area_atuacao: "Ortodontia" }), imbx({ email: "c@x.com" })];

  it("lista valores com contagem e filtra", () => {
    expect(valoresDoCampo(base, "especialidade")).toEqual([
      { valor: "Prótese", n: 2 },
      { valor: "Ortodontia", n: 1 },
    ]);
    expect(filtrarResposta(base, "especialidade", "Ortodontia").map((i) => i.email)).toEqual(["b@x.com"]);
    expect(filtrarResposta(base, "especialidade", "")).toHaveLength(3);
  });

  it("só oferece campos que existem na base", () => {
    const chaves = camposDisponiveis([p()]).map((c) => c.chave);
    expect(chaves).not.toContain("confirmou_form");
    expect(camposDisponiveis(base).map((c) => c.chave)).toContain("confirmou_form");
  });

  it("busca acha por CRO e eTicket", () => {
    expect(filtrarParticipantes(base, "4822311006457619574")).toHaveLength(3);
  });
});
