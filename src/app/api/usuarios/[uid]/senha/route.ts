import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin, responderErro } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { gerarSenhaTemporaria, traduzirErro } from "@/lib/usuarios-server";

export const runtime = "nodejs";

/**
 * POST /api/usuarios/[uid]/senha — gera uma senha temporária nova. Só admin.
 *
 * A senha atual morre na hora e as sessões abertas caem: quem pede reset
 * geralmente perdeu o controle da conta (esqueceu, vazou, celular sumiu no
 * evento), então deixar sessões antigas vivas anularia o próprio reset.
 * A nova é devolvida UMA única vez e obriga troca no próximo acesso.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ uid: string }> }) {
  try {
    await exigirAdmin(req);
    const { uid } = await ctx.params;

    const admin = supabaseAdmin();
    const { data: alvo, error: erroBusca } = await admin
      .from("usuarios")
      .select("id, ativo")
      .eq("id", uid)
      .single();
    if (erroBusca || !alvo) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }
    if (!alvo.ativo) {
      return NextResponse.json(
        { error: "Usuário desativado. Reative antes de gerar senha." },
        { status: 400 }
      );
    }

    const senha = gerarSenhaTemporaria();

    const { error: erroAuth } = await admin.auth.admin.updateUserById(uid, {
      password: senha,
    });
    if (erroAuth) {
      return NextResponse.json({ error: traduzirErro(erroAuth.message) }, { status: 409 });
    }

    await admin.from("usuarios").update({ precisa_trocar_senha: true }).eq("id", uid);
    await admin.auth.admin.signOut(uid, "global").catch(() => {});

    return NextResponse.json({ senhaTemporaria: senha });
  } catch (e) {
    return responderErro(e);
  }
}
