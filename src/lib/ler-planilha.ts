import ExcelJS from "exceljs";
import type { LinhaPlanilha } from "./importacao-leads";

// ─────────────────────────────────────────────────────────────────────────
// Leitura do arquivo da planilha (.xlsx ou .csv) → linhas cabeçalho→valor.
//
// Uma porta só para as duas importações (participantes e inscritos): o
// arquivo é o mesmo export do credenciamento, e cada tela interpreta as
// colunas que lhe interessam. Roda no servidor — ver /api/leads/importar.
// ─────────────────────────────────────────────────────────────────────────

export function ehPlanilha(nomeArquivo: string): boolean {
  return /\.(xlsx|csv)$/i.test(nomeArquivo.trim());
}

/** Lê .xlsx (primeira aba) ou .csv. Lança Error com mensagem para o usuário. */
export async function lerPlanilha(arquivo: File): Promise<LinhaPlanilha[]> {
  if (/\.csv$/i.test(arquivo.name)) return lerCsv(decodificar(await arquivo.arrayBuffer()));
  return lerXlsx(await arquivo.arrayBuffer());
}

export async function lerXlsx(conteudo: ArrayBuffer): Promise<LinhaPlanilha[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(conteudo);
  } catch {
    throw new Error("Não consegui abrir o arquivo. Ele é mesmo um .xlsx?");
  }

  const aba = wb.worksheets[0];
  if (!aba) throw new Error("A planilha não tem nenhuma aba.");

  const cabecalhos: string[] = [];
  aba.getRow(1).eachCell((celula, col) => {
    cabecalhos[col - 1] = String(celula.value ?? "").trim();
  });

  const linhas: LinhaPlanilha[] = [];
  aba.eachRow((linha, numero) => {
    if (numero === 1) return;
    const obj: LinhaPlanilha = {};
    cabecalhos.forEach((cab, i) => {
      if (!cab) return;
      const v = linha.getCell(i + 1).value;
      // Célula de e-mail vem como objeto de hyperlink; interessa o texto.
      obj[cab] =
        v && typeof v === "object" && "text" in v
          ? (v as { text: unknown }).text
          : (v as unknown);
    });
    linhas.push(obj);
  });
  return linhas;
}

/**
 * CSV salvo pelo Excel em português vem em Windows-1252 e com ";" — o
 * de outros sistemas, em UTF-8 e com ",". Aceita os dois.
 */
function decodificar(conteudo: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(conteudo);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(conteudo) : utf8;
}

export function lerCsv(texto: string): LinhaPlanilha[] {
  const limpo = texto.replace(/^﻿/, "");
  const primeira = limpo.slice(0, limpo.search(/\r?\n/) === -1 ? undefined : limpo.search(/\r?\n/));
  const sep = (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";

  // Parser com aspas: campo entre "..." pode ter o separador e quebra de linha.
  const registros: string[][] = [];
  let campo = "";
  let registro: string[] = [];
  let aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      registro.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpo[i + 1] === "\n") i++;
      registro.push(campo);
      registros.push(registro);
      campo = "";
      registro = [];
    } else campo += c;
  }
  if (campo || registro.length) {
    registro.push(campo);
    registros.push(registro);
  }

  const [cab, ...resto] = registros.filter((r) => r.some((v) => v.trim() !== ""));
  if (!cab) return [];
  const cabecalhos = cab.map((c) => c.trim());
  return resto.map((r) => {
    const obj: LinhaPlanilha = {};
    cabecalhos.forEach((h, i) => {
      if (h) obj[h] = r[i] ?? null;
    });
    return obj;
  });
}
