import { describe, expect, it } from "vitest";
import { inscritosDaPlanilha, linhaParaGravar, type InscritoExistente } from "./planilha-inscritos";
import { lerCsv } from "./ler-planilha";

/** Linha no formato real da exportação de participantes (IMBX MG). */
const linha = (over: Record<string, unknown> = {}) => ({
  Nome: "Ada Neves",
  CPF: "510.741.416-87",
  Telefone: "5531999864686",
  Email: " AdaPontellon@Hotmail.com ",
  Classificação: "Convidado(a) SIBX",
  Ingresso: "Enviado",
  "Pré-Checkin": "Confirmado",
  "Check-in D1": "Sim",
  "Check-in D2": "Não",
  "Check-in D3": "Não",
  "NPS D1": "Sim",
  "Qualificação (CRO)": "Válido",
  Motivo: "—",
  eTicket: "7014201595896787578",
  ...over,
});

describe("inscritosDaPlanilha", () => {
  it("lê a exportação real: e-mail, telefone, ingresso e presença por dia", () => {
    const { inscritos, temPresenca, descartados } = inscritosDaPlanilha([linha()]);
    expect(temPresenca).toBe(true);
    expect(descartados).toBe(0);
    expect(inscritos[0]).toMatchObject({
      email: "adapontellon@hotmail.com",
      nome: "Ada Neves",
      whatsapp: "5531999864686",
      categoriaTicket: "Convidado(a) SIBX",
      d1: true,
      d2: false,
      d3: false,
    });
  });

  it("NPS D1 não é confundido com check-in, e o resto vai para extras", () => {
    const { inscritos } = inscritosDaPlanilha([linha({ "Check-in D1": "Não", "NPS D1": "Sim" })]);
    expect(inscritos[0].d1).toBe(false);
    expect(inscritos[0].extras).toMatchObject({
      eticket: "7014201595896787578",
      pre_checkin: "Confirmado",
      nps_d1: "Sim",
      qualificacao_cro: "Válido",
    });
    expect(inscritos[0].extras).not.toHaveProperty("motivo"); // "—" é vazio
  });

  it("descarta linha sem e-mail e exige a coluna de e-mail", () => {
    expect(inscritosDaPlanilha([linha({ Email: "—" })]).descartados).toBe(1);
    expect(() => inscritosDaPlanilha([{ Nome: "x" }])).toThrow(/e-mail/);
  });
});

describe("linhaParaGravar", () => {
  const existente: InscritoExistente = {
    email: "adapontellon@hotmail.com",
    whatsapp: "(31) 99986-4686",
    categoria_ticket: "VIP",
    checkin_feito: false,
    d1: false,
    d2: true,
    d3: false,
    extras: { instagram: "@ada" },
  };

  it("planilha com check-in manda na presença e soma extras sem perder os do painel", () => {
    const { inscritos } = inscritosDaPlanilha([linha()]);
    const r = linhaParaGravar("ev", inscritos[0], existente, true, "agora");
    expect(r).toMatchObject({ d1: true, d2: false, checkin_feito: true, categoria_ticket: "Convidado(a) SIBX" });
    expect(r.extras).toMatchObject({ instagram: "@ada", eticket: "7014201595896787578" });
    // Lead Score não é coluna da gravação: o upsert não mexe nele.
    expect(r).not.toHaveProperty("classe");
  });

  it("sem colunas de check-in, mantém a presença que já estava", () => {
    const { inscritos, temPresenca } = inscritosDaPlanilha([{ Nome: "Ada", Email: "adapontellon@hotmail.com" }]);
    const r = linhaParaGravar("ev", inscritos[0], existente, temPresenca, "agora");
    expect(r).toMatchObject({ d2: true, whatsapp: "(31) 99986-4686", categoria_ticket: "VIP" });
  });
});

describe("lerCsv", () => {
  it("aceita ; do Excel em português, aspas e BOM", () => {
    const linhas = lerCsv('﻿Nome;Email;eTicket\r\n"Silva; Ana";ana@x.com;123\r\n\r\n');
    expect(linhas).toEqual([{ Nome: "Silva; Ana", Email: "ana@x.com", eTicket: "123" }]);
  });
  it("aceita , com aspas escapadas", () => {
    expect(lerCsv('Nome,Email\n"Zé ""Bola""",ze@x.com')).toEqual([{ Nome: 'Zé "Bola"', Email: "ze@x.com" }]);
  });
});
