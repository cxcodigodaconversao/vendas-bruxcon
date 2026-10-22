import { describe, expect, it } from "vitest";
import {
  gerarLinksDoCatalogo,
  lerOferta,
  lerSck,
  removerSck,
  sugerirSck,
  trocarOferta,
  trocarSck,
  validarSck,
} from "./links";

// URL no formato real da base.
const REAL = "https://pay.hotmart.com/G103456591L?off=hrbkppf0&sck=Mila";

describe("trocarSck", () => {
  it("troca o token mantendo produto e oferta", () => {
    expect(trocarSck(REAL, "AnaPaula")).toBe(
      "https://pay.hotmart.com/G103456591L?off=hrbkppf0&sck=AnaPaula"
    );
  });

  it("não mexe em nenhum outro parâmetro", () => {
    const url = "https://pay.hotmart.com/X?a=1&sck=Antigo&b=2&off=zzz";
    expect(trocarSck(url, "Novo")).toBe("https://pay.hotmart.com/X?a=1&sck=Novo&b=2&off=zzz");
  });

  it("acrescenta o sck quando o link é de casa (sem dono)", () => {
    expect(trocarSck("https://pay.hotmart.com/X?off=abc", "Novo")).toBe(
      "https://pay.hotmart.com/X?off=abc&sck=Novo"
    );
  });

  it("usa ? quando a URL não tem query nenhuma", () => {
    expect(trocarSck("https://pay.hotmart.com/X", "Novo")).toBe(
      "https://pay.hotmart.com/X?sck=Novo"
    );
  });

  it("preserva a âncora ao acrescentar", () => {
    expect(trocarSck("https://pay.hotmart.com/X?off=a#topo", "N")).toBe(
      "https://pay.hotmart.com/X?off=a&sck=N#topo"
    );
  });

  it("reconhece SCK em maiúscula", () => {
    expect(trocarSck("https://x.com/y?SCK=Velho", "Novo")).toBe("https://x.com/y?SCK=Novo");
  });

  it("não deixa o sck em branco passar — seria comissão sem dono", () => {
    expect(() => trocarSck(REAL, "   ")).toThrow();
  });

  it("troca só o primeiro sck, não pedaços parecidos de outros campos", () => {
    const url = "https://x.com/y?tracksck=nao&sck=Sim";
    // `tracksck` não começa em ? nem &, então não pode ser confundido
    expect(trocarSck(url, "Novo")).toBe("https://x.com/y?tracksck=nao&sck=Novo");
  });
});

describe("lerSck", () => {
  it("lê o token da URL real", () => {
    expect(lerSck(REAL)).toBe("Mila");
  });
  it("devolve null quando não há", () => {
    expect(lerSck("https://pay.hotmart.com/X?off=a")).toBeNull();
  });
});

describe("lerOferta", () => {
  it("extrai o código da oferta da URL real", () => {
    expect(lerOferta(REAL)).toBe("hrbkppf0");
  });
  it("acha independente da posição do parâmetro", () => {
    expect(lerOferta("https://pay.hotmart.com/X?sck=A&off=zzz111&b=2")).toBe("zzz111");
  });
  it("devolve null quando não há oferta na URL", () => {
    expect(lerOferta("https://pay.hotmart.com/X?sck=A")).toBeNull();
  });
});

describe("trocarOferta", () => {
  it("troca a oferta PRESERVANDO o token de quem é o link", () => {
    // O caso real: oferta cadastrada errada para o time inteiro. Cada
    // vendedor tem que continuar com o próprio sck depois da correção.
    expect(trocarOferta(REAL, "xvgsr15c")).toBe(
      "https://pay.hotmart.com/G103456591L?off=xvgsr15c&sck=Mila"
    );
  });

  it("preserva a ordem e os demais parâmetros", () => {
    expect(trocarOferta("https://x.com/y?a=1&off=velho&b=2", "novo")).toBe(
      "https://x.com/y?a=1&off=novo&b=2"
    );
  });

  it("acrescenta quando a URL não tem oferta", () => {
    expect(trocarOferta("https://x.com/y?sck=A", "nova")).toBe("https://x.com/y?sck=A&off=nova");
  });

  it("recusa oferta em branco — levaria o cliente a lugar nenhum", () => {
    expect(() => trocarOferta(REAL, "  ")).toThrow();
  });
});

describe("removerSck", () => {
  it("tira o token do meio da URL sem deixar & solto", () => {
    expect(removerSck("https://x.com/y?a=1&sck=Felipe&b=2")).toBe("https://x.com/y?a=1&b=2");
  });
  it("tira o token do fim", () => {
    expect(removerSck(REAL)).toBe("https://pay.hotmart.com/G103456591L?off=hrbkppf0");
  });
  it("tira o token quando é o único parâmetro, sem deixar ? sobrando", () => {
    expect(removerSck("https://x.com/y?sck=Felipe")).toBe("https://x.com/y");
  });
  it("não mexe em URL que já não tem token", () => {
    const u = "https://x.com/y?off=abc";
    expect(removerSck(u)).toBe(u);
  });
});

describe("distribuir a mesma oferta para vários vendedores", () => {
  // O caso de "atribuir para todos": uma URL base vira uma variante por
  // pessoa, cada uma com o próprio token — é o token que separa a comissão.
  const VENDEDORES = [
    { nome: "Mila", sck: "mila" },
    { nome: "Rodrigo", sck: "rodrigo" },
    { nome: "Sem nome (casa)", sck: "" },
  ];

  // A URL colada pelo admin quase sempre tem o token de ALGUÉM: ele copia
  // do painel a partir do link de um vendedor qualquer.
  const distribuir = (url: string) =>
    VENDEDORES.map((v) => (v.sck ? trocarSck(url, v.sck) : removerSck(url)));

  it("cada vendedor recebe o próprio token, e o resto da URL não muda", () => {
    const urls = distribuir(REAL);
    expect(urls[0]).toBe("https://pay.hotmart.com/G103456591L?off=hrbkppf0&sck=mila");
    expect(urls[1]).toBe("https://pay.hotmart.com/G103456591L?off=hrbkppf0&sck=rodrigo");
    urls.forEach((u) => expect(lerOferta(u)).toBe("hrbkppf0"));
  });

  it("o link da casa fica SEM token — não com o de quem estava na URL colada", () => {
    // Sem isto, venda da casa pagaria comissão ao dono do link copiado.
    const urls = distribuir("https://pay.hotmart.com/G103456591L?off=hrbkppf0&sck=Felipe");
    expect(lerSck(urls[2])).toBeNull();
    expect(urls.some((u) => u.includes("sck=Felipe"))).toBe(false);
  });
});

describe("validarSck", () => {
  it("aceita token normal", () => {
    expect(validarSck("GabrielAduati")).toBeNull();
    expect(validarSck("ana_paula-2")).toBeNull();
  });
  it("recusa vazio", () => {
    expect(validarSck("  ")).toMatch(/informe/i);
  });
  it("recusa espaço e acento — viram escape ilegível no relatório", () => {
    expect(validarSck("Ana Paula")).toMatch(/espaço/i);
    expect(validarSck("Otávio")).toMatch(/acento/i);
  });
});

describe("sugerirSck", () => {
  it("usa os dois primeiros nomes, sem acento", () => {
    expect(sugerirSck("Ana Paula Rodrigues Galvão")).toBe("AnaPaula");
    expect(sugerirSck("Otávio Henrique Ribeiro")).toBe("OtavioHenrique");
  });
  it("funciona com nome único", () => {
    expect(sugerirSck("Mila")).toBe("Mila");
  });
});

describe("gerarLinksDoCatalogo", () => {
  const catalogo = [
    { oferta: "hrbkppf0", url: "https://pay.hotmart.com/G103456591L?off=hrbkppf0", valor: 28000, condicao: "À vista" },
    { oferta: "x12", url: "https://pay.hotmart.com/G103456591L?off=x12", valor: 29997, condicao: "12x" },
  ];

  it("gera uma linha por oferta × vendedor, com o sck de cada um", () => {
    const linhas = gerarLinksDoCatalogo("ev-1", catalogo, [
      { nome: "Mila", sck: "Mila" },
      { nome: "Ana Paula", sck: "AnaPaula" },
    ]);
    expect(linhas).toHaveLength(4);
    expect(linhas[0]).toEqual({
      evento_id: "ev-1",
      vendedor_nome: "Mila",
      sck: "Mila",
      status: "new",
      oferta: "hrbkppf0",
      valor: 28000,
      condicao: "À vista",
      url: "https://pay.hotmart.com/G103456591L?off=hrbkppf0&sck=Mila",
    });
    expect(linhas[3].url).toBe("https://pay.hotmart.com/G103456591L?off=x12&sck=AnaPaula");
  });

  it("link de casa (sem sck) sai SEM rastreio, mesmo que o molde viesse com um", () => {
    const comToken = [{ ...catalogo[0], url: catalogo[0].url + "&sck=Alguem" }];
    const [linha] = gerarLinksDoCatalogo("ev-1", comToken, [{ nome: "Casa", sck: null }]);
    expect(linha.sck).toBeNull();
    expect(linha.url).toBe("https://pay.hotmart.com/G103456591L?off=hrbkppf0");
  });

  it("ignora oferta e vendedor em branco", () => {
    const linhas = gerarLinksDoCatalogo(
      "ev-1",
      [...catalogo, { oferta: " ", url: "https://x", valor: null, condicao: null }],
      [{ nome: "Mila", sck: "Mila" }, { nome: "  ", sck: "Z" }]
    );
    expect(linhas).toHaveLength(2);
  });

  it("recusa evento sem id (evento provisório)", () => {
    expect(() => gerarLinksDoCatalogo("", catalogo, [{ nome: "Mila", sck: "Mila" }])).toThrow();
  });
});
