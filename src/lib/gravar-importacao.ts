import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadImportado, LinhaPlanilha } from "./importacao-leads";
import { inscritosDaPlanilha, linhaParaGravar, type InscritoExistente } from "./planilha-inscritos";

// Gravação compartilhada pelas duas importações (Participantes e Análise):
// a mesma planilha atualiza os crachás (`leads`) e a base de inscritos.

/** Upsert por (evento, crachá): reenviar a planilha atualiza em vez de duplicar. */
export async function gravarLeads(admin: SupabaseClient, eventoId: string, leads: LeadImportado[]) {
  let gravados = 0;
  for (let i = 0; i < leads.length; i += 500) {
    const lote = leads.slice(i, i + 500).map((l) => ({
      evento_id: eventoId,
      codigo_cracha: l.codigoCracha,
      nome: l.nome,
      email: l.email,
      cpf: l.cpf,
      telefone: l.telefone,
      tipo: l.tipo,
      especialidade: l.especialidade,
    }));
    const { error } = await admin
      .from("leads")
      .upsert(lote, { onConflict: "evento_id,codigo_cracha" });
    if (error) throw new Error(`Falha ao gravar: ${error.message}`);
    gravados += lote.length;
  }
  return gravados;
}

/**
 * Mescla a planilha na base de inscritos do evento (ver planilha-inscritos).
 * Lança Error se a planilha não tiver coluna de e-mail.
 */
export async function sincronizarInscritos(admin: SupabaseClient, eventoId: string, linhas: LinhaPlanilha[]) {
  const { inscritos, descartados, temPresenca } = inscritosDaPlanilha(linhas);

  // Em páginas: o PostgREST devolve no máximo 1000 linhas por consulta.
  const existentes = new Map<string, InscritoExistente>();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await admin
      .from("inscritos")
      .select("email, whatsapp, categoria_ticket, checkin_feito, d1, d2, d3, extras")
      .eq("evento_id", eventoId)
      .range(de, de + 999);
    if (error) throw new Error("Falha ao ler a base de inscritos: " + error.message);
    for (const r of (data ?? []) as InscritoExistente[]) existentes.set(r.email, r);
    if (!data || data.length < 1000) break;
  }

  const agora = new Date().toISOString();
  const linhasDb = inscritos.map((i) => linhaParaGravar(eventoId, i, existentes.get(i.email), temPresenca, agora));
  for (let i = 0; i < linhasDb.length; i += 200) {
    const { error } = await admin
      .from("inscritos")
      .upsert(linhasDb.slice(i, i + 200), { onConflict: "evento_id,email" });
    if (error) throw new Error("Falha ao gravar inscritos: " + error.message);
  }

  const novos = inscritos.filter((i) => !existentes.has(i.email)).length;
  return { importados: linhasDb.length, novos, atualizados: linhasDb.length - novos, descartados };
}
