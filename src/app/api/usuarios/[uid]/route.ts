import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin, responderErro } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SELECT_USUARIO } from "@/lib/consultas";
import {
  contarVendas,
  garantirQueSobraAdmin,
  traduzirErro,
  validarPapel,
} from "@/lib/usuarios-server";

export const runtime = "nodejs";

/**
 * PATCH /api/usuarios/[uid] — edita cadastro (nome, papel, sck, telefone,
 * ativo, aparece no ranking). Só admin.
 *
 * Duas travas de sobrevivência do sistema:
 * · Rebaixar ou desativar o ÚLTIMO admin ativo é recusado — sem isso, um
 *   clique errado tranca a gestão para sempre e só se resolve no banco.
 * · Campos não enviados não são tocados (patch parcial de verdade).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ uid: string }> }) {
  try {
    await exigirAdmin(req);
    const { uid } = await ctx.params;
    const corpo = await req.json();

    const admin = supabaseAdmin();
    const { data: atual, error: erroBusca } = await admin
      .from("usuarios")
      .select("id, papel, ativo")
      .eq("id", uid)
      .single();
    if (erroBusca || !atual) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    const mudancas: Record<string, unknown> = {};

    if (corpo.nome !== undefined) {
      const nome = String(corpo.nome).trim();
      if (!nome) return NextResponse.json({ error: "Informe o nome." }, { status: 400 });
      mudancas.nome = nome;
    }
    if (corpo.papel !== undefined) {
      const papel = validarPapel(corpo.papel);
      // Tirar o último admin do posto deixaria o sistema órfão.
      if (atual.papel === "admin" && papel !== "admin") await garantirQueSobraAdmin(uid);
      mudancas.papel = papel;
    }
    if (corpo.sck !== undefined) {
      mudancas.sck = corpo.sck ? String(corpo.sck).trim() : null;
    }
    if (corpo.telefone !== undefined) {
      mudancas.telefone = corpo.telefone ? String(corpo.telefone).trim() : null;
    }
    if (corpo.apareceRanking !== undefined) {
      mudancas.aparece_ranking = corpo.apareceRanking !== false;
    }
    if (corpo.ativo !== undefined) {
      const ativo = corpo.ativo !== false;
      if (!ativo && atual.papel === "admin") await garantirQueSobraAdmin(uid);
      mudancas.ativo = ativo;
      mudancas.desativado_em = ativo ? null : new Date().toISOString();
    }

    if (!Object.keys(mudancas).length) {
      return NextResponse.json({ error: "Nada para alterar." }, { status: 400 });
    }

    const { data: usuario, error } = await admin
      .from("usuarios")
      .update(mudancas)
      .eq("id", uid)
      .select(SELECT_USUARIO)
      .single();
    if (error) {
      return NextResponse.json({ error: traduzirErro(error.message) }, { status: 409 });
    }

    // Desativar também derruba as sessões abertas: sem isso a pessoa
    // continuaria usando o app até o token expirar.
    if (mudancas.ativo === false) {
      await admin.auth.admin.signOut(uid, "global").catch(() => {});
    }

    return NextResponse.json({ usuario });
  } catch (e) {
    return responderErro(e);
  }
}

/**
 * DELETE /api/usuarios/[uid] — exclui de vez. Só admin, e só quem nunca
 * vendeu: com venda no histórico, o caminho é desativar (o banco também
 * barra, via ON DELETE RESTRICT — a checagem aqui só devolve uma mensagem
 * legível em vez de um erro de chave estrangeira).
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ uid: string }> }) {
  try {
    const chamador = await exigirAdmin(req);
    const { uid } = await ctx.params;

    if (uid === chamador.id) {
      return NextResponse.json({ error: "Você não pode excluir a si mesmo." }, { status: 400 });
    }

    const vendas = await contarVendas(uid);
    if (vendas > 0) {
      return NextResponse.json(
        { error: `Tem ${vendas} venda(s) registrada(s). Desative em vez de excluir.` },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();
    const { data: alvo } = await admin
      .from("usuarios")
      .select("papel")
      .eq("id", uid)
      .single();
    if (alvo?.papel === "admin") await garantirQueSobraAdmin(uid);

    const { error } = await admin.from("usuarios").delete().eq("id", uid);
    if (error) {
      return NextResponse.json({ error: traduzirErro(error.message) }, { status: 409 });
    }
    await admin.auth.admin.deleteUser(uid).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderErro(e);
  }
}
