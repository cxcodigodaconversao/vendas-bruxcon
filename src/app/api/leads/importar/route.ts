import { NextRequest, NextResponse } from "next/server";
import { ErroApi, autenticar, responderErro } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  erroDeEstrutura,
  interpretarPlanilha,
  type LinhaPlanilha,
} from "@/lib/importacao-leads";
import { lerPlanilha } from "@/lib/ler-planilha";
import { gravarLeads, sincronizarInscritos } from "@/lib/gravar-importacao";

export const runtime = "nodejs";
// Planilha de 900 linhas leva mais que o padrão de 10s da plataforma.
export const maxDuration = 60;

const TAMANHO_MAXIMO = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/leads/importar — sobe a planilha de participantes de um evento
 * (.xlsx ou .csv). Grava os crachás e, se houver e-mail, a base de inscritos.
 *
 * A leitura do arquivo acontece AQUI, não no navegador: o app é usado no
 * celular, e mandar um parser de xlsx para dentro do bundle penalizaria
 * todo mundo por causa de uma tela que só admin abre, de vez em quando.
 */
export async function POST(req: NextRequest) {
  try {
    const chamador = await autenticar(req);
    if (chamador.papel !== "admin" && chamador.papel !== "gestor") {
      throw new ErroApi(403, "Só admin ou gestor importa participantes.");
    }

    const form = await req.formData();
    const arquivo = form.get("arquivo");
    const eventoId = String(form.get("eventoId") ?? "");
    const confirmar = String(form.get("confirmar") ?? "") === "sim";

    if (!(arquivo instanceof File)) throw new ErroApi(400, "Nenhum arquivo enviado.");
    if (!eventoId) throw new ErroApi(400, "Evento não informado.");
    if (arquivo.size > TAMANHO_MAXIMO) {
      throw new ErroApi(413, "Arquivo acima de 10 MB. Exporte só a aba de participantes.");
    }

    const admin = supabaseAdmin();
    const { data: evento } = await admin
      .from("eventos")
      .select("id, nome")
      .eq("id", eventoId)
      .maybeSingle();
    if (!evento) throw new ErroApi(404, "Evento não encontrado.");

    // ── Ler a planilha (.xlsx ou .csv) ───────────────────────────────
    let linhas: LinhaPlanilha[];
    try {
      linhas = await lerPlanilha(arquivo);
    } catch (e) {
      throw new ErroApi(400, (e as Error).message);
    }

    const relatorio = interpretarPlanilha(linhas);
    const erro = erroDeEstrutura(relatorio);
    if (erro) throw new ErroApi(422, erro);

    // ── Prévia: mostra o que vai acontecer antes de gravar ───────────
    // Em lotes: 900 códigos numa URL só passam do limite do servidor.
    const codigos = relatorio.leads.map((l) => l.codigoCracha);
    const jaExistem = new Set<string>();
    for (let i = 0; i < codigos.length; i += 200) {
      const { data: existentes } = await admin
        .from("leads")
        .select("codigo_cracha")
        .eq("evento_id", eventoId)
        .in("codigo_cracha", codigos.slice(i, i + 200));
      for (const l of existentes ?? []) jaExistem.add(l.codigo_cracha as string);
    }
    const novos = relatorio.leads.filter((l) => !jaExistem.has(l.codigoCracha)).length;

    const resumo = {
      evento: evento.nome,
      linhasNaPlanilha: relatorio.total,
      importaveis: relatorio.leads.length,
      novos,
      atualizados: relatorio.leads.length - novos,
      ignoradas: relatorio.ignoradas.length,
      // Amostra: a lista inteira de ignoradas pode ter centenas de linhas.
      exemplosIgnorados: relatorio.ignoradas.slice(0, 8),
      colunasDesconhecidas: relatorio.colunasDesconhecidas,
    };

    if (!confirmar) return NextResponse.json({ previa: true, resumo });

    // ── Gravar ───────────────────────────────────────────────────────
    // Upsert por (evento, crachá): reenviar a planilha atualiza quem já
    // está lá em vez de duplicar, e é assim que o time reimporta durante o
    // evento conforme os ingressos vão sendo emitidos.
    let gravados: number;
    try {
      gravados = await gravarLeads(admin, eventoId, relatorio.leads);
    } catch (e) {
      throw new ErroApi(500, (e as Error).message);
    }

    // A mesma planilha alimenta as abas Participantes e Análise. Sem coluna
    // de e-mail não há como casar com os inscritos — os crachás já foram.
    let inscritos: Awaited<ReturnType<typeof sincronizarInscritos>> | null = null;
    if (relatorio.colunasEncontradas.email) {
      try {
        inscritos = await sincronizarInscritos(admin, eventoId, linhas);
      } catch (e) {
        throw new ErroApi(500, "Crachás importados, mas a lista de participantes falhou: " + (e as Error).message);
      }
    }

    return NextResponse.json({ previa: false, resumo: { ...resumo, gravados, inscritos } });
  } catch (e) {
    return responderErro(e);
  }
}
