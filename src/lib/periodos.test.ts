import { describe, expect, it } from "vitest";
import { normalizarLinha } from "./analise";
import { filtrarRecorte, noTurno, resumoPeriodos, temTurnos } from "./periodos";

const p = (email: string, dias: { d1?: boolean; d2?: boolean; d3?: boolean }, sessoes: Record<string, string> = {}) =>
  normalizarLinha({ email, nome: email, ...dias, sessoes })!;

// a: D1 + D2 inteiro · b: D1 e não voltou · c: só D2 manhã (novo) ·
// d: novo à tarde no D2 · e: D1 e D2 só à tarde (não é novo) · f: ausente
const base = [
  p("a@x", { d1: true, d2: true }, { d2m: "Sim", d2t: "Sim" }),
  p("b@x", { d1: true }, { d1m: "Sem turno" }),
  p("c@x", { d2: true }, { d2m: "Sim", d2t: "Não" }),
  p("d@x", { d2: true }, { d2m: "Não", d2t: "Sim" }),
  p("e@x", { d1: true, d2: true }, { d2m: "Não", d2t: "Sim" }),
  p("f@x", {}),
];
const n = (chave: string) => resumoPeriodos(base).linhas.find((l) => l.chave === chave)?.n;
const quem = (chave: string) => filtrarRecorte(base, chave).map((i) => i.email);

describe("periodos", () => {
  it("lê o turno de extras.sessoes", () => {
    expect(noTurno(base[0], "d2m")).toBe(true);
    expect(noTurno(base[1], "d1m")).toBe(false); // "Sem turno" não é check-in de turno
    expect(temTurnos(base)).toBe(true);
    expect(temTurnos([p("z@x", { d1: true })])).toBe(false);
  });

  it("períodos e total de pessoas únicas", () => {
    expect(n("p_d1")).toBe(3);
    expect(n("p_d2m")).toBe(2);
    expect(n("p_d2t")).toBe(3);
    expect(n("t_d12")).toBe(5);
    expect(resumoPeriodos(base).presentes).toBe(5);
  });

  it("combinações do D2", () => {
    expect(quem("c_d2mt")).toEqual(["a@x"]);
    expect(quem("c_d2m")).toEqual(["c@x"]);
    expect(quem("c_d2t")).toEqual(["d@x", "e@x"]);
    expect(quem("c_d1d2")).toEqual(["a@x", "e@x"]);
    expect(quem("c_d1so")).toEqual(["b@x"]);
  });

  it("novos: só tarde sem D1 nem manhã é novo; quem veio no D1 não", () => {
    expect(quem("n_d2")).toEqual(["c@x", "d@x"]);
    expect(quem("n_d2m")).toEqual(["c@x"]);
    expect(quem("n_d2t")).toEqual(["d@x"]);
  });

  it("D3 só aparece quando alguém veio no D3", () => {
    expect(resumoPeriodos(base).linhas.some((l) => l.dia === 3)).toBe(false);
    const com3 = [...base, p("g@x", { d3: true }, { d3m: "Não", d3t: "Sim" })];
    const r = resumoPeriodos(com3).linhas;
    expect(r.find((l) => l.chave === "n_d3t")?.n).toBe(1);
    expect(r.find((l) => l.chave === "t_d123")?.n).toBe(6);
  });
});
