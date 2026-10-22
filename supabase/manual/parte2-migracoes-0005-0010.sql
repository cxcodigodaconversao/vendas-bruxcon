-- PARTE 2 de 3 — rode só depois que a parte 1 terminar sem erro.
-- Junta as migrações 0005 a 0010 e, no fim, registra 0001–0010 como
-- já aplicadas, para a integração GitHub do Supabase não rodá-las de novo.


-- ===================== supabase/migrations/0005_permissoes_do_promotor.sql =====================
-- ═════════════════════════════════════════════════════════════════════════
-- Permissões do papel `promotor` — o operador de contratos.
--
-- O trabalho dele é pegar cada venda registrada e gerar o texto do plano de
-- pagamento para o contrato. Para isso precisa ENXERGAR a venda de todo
-- mundo, mas não é da disputa comercial: nada de ranking, de totais do
-- evento ou de meta (isso é tratado nas telas).
--
-- No banco, o que importa garantir é o oposto do que ele vê: que ele NÃO
-- consiga alterar o dinheiro de uma venda que não é dele.
-- ═════════════════════════════════════════════════════════════════════════

-- ── Faz parte da equipe (entra no app, registra a própria venda) ────────
create or replace function public.eh_equipe()
returns boolean language sql stable as $$
  select public.papel_atual() in ('admin', 'gestor', 'closer', 'promotor')
$$;

-- ── Enxerga o evento inteiro ────────────────────────────────────────────
-- `ve_tudo` passa a significar "lê tudo do evento", e é usada nas políticas
-- de SELECT. Onde o sentido é "manda no evento" (editar venda alheia, mexer
-- em lead, apagar), as políticas usam papéis explícitos — ver abaixo.
create or replace function public.ve_tudo()
returns boolean language sql stable as $$
  select public.papel_atual() in ('admin', 'gestor', 'promotor')
$$;

-- Quem coordena o evento de fato: edita venda alheia, corrige cadastro de
-- lead, gere a equipe. O promotor NÃO entra aqui.
create or replace function public.coordena()
returns boolean language sql stable as $$
  select public.papel_atual() in ('admin', 'gestor')
$$;

-- ── Reapontar as políticas que significam "coordenar", não "ler" ───────
drop policy if exists equipe_escrita on public.evento_equipe;
create policy equipe_escrita on public.evento_equipe
  for all to authenticated using (public.coordena()) with check (public.coordena());

drop policy if exists leads_manutencao on public.leads;
create policy leads_manutencao on public.leads
  for all to authenticated using (public.coordena()) with check (public.coordena());

-- ── A trava que sustenta tudo ───────────────────────────────────────────
-- O promotor precisa de UPDATE em venda alheia para gravar o contrato. Sem
-- limite de coluna, isso seria permissão para reescrever valor e pontuação
-- de qualquer venda do evento.
--
-- A comparação é por linha inteira menos as colunas liberadas, e não por
-- lista de campos proibidos: assim uma coluna criada no futuro nasce
-- protegida, em vez de ficar aberta até alguém lembrar de adicioná-la.
create or replace function public.limitar_edicao_do_promotor()
returns trigger language plpgsql as $$
begin
  if auth.uid() is null or public.papel_atual() is distinct from 'promotor' then
    return new;
  end if;

  -- Na própria venda ele é dono e edita normalmente.
  if new.usuario_id = auth.uid() then
    return new;
  end if;

  if (to_jsonb(new) - 'contrato' - 'contrato_em' - 'atualizado_em')
     is distinct from
     (to_jsonb(old) - 'contrato' - 'contrato_em' - 'atualizado_em') then
    raise exception
      'Promotor só pode gravar o texto do contrato em vendas de outra pessoa.';
  end if;

  return new;
end $$;

create trigger vendas_limitar_promotor
  before update on public.vendas
  for each row execute function public.limitar_edicao_do_promotor();

-- ── Exclusão de venda segue só do admin ────────────────────────────────
-- (a política vendas_exclusao já usa eh_admin(); nada a mudar)

comment on function public.ve_tudo is
  'Lê o evento inteiro: admin, gestor e promotor. Para "manda no evento", use coordena().';
comment on function public.coordena is
  'Coordena o evento: admin e gestor. Exclui o promotor, que só lê e gera contrato.';

-- ===================== supabase/migrations/0006_corrigir_trava_do_lead.sql =====================
-- Corrige efeito colateral da 0005.
--
-- Ao incluir o promotor em `ve_tudo()`, o trigger que protege o cadastro do
-- lead passou a liberá-lo junto — ele usava `ve_tudo()` querendo dizer
-- "quem coordena", e o sentido dessa função mudou para "quem lê tudo".
--
-- Pego pelo teste `promotor NÃO edita cadastro de lead` em
-- scripts/testar-rls.mjs, que falhou assim que a 0005 entrou.

create or replace function public.travar_cadastro_do_lead()
returns trigger language plpgsql as $$
begin
  -- coordena() = admin e gestor. O service role entra pelo auth.uid() nulo.
  if public.coordena() or auth.uid() is null then
    return new;
  end if;
  if new.nome is distinct from old.nome
     or new.cpf is distinct from old.cpf
     or new.email is distinct from old.email
     or new.telefone is distinct from old.telefone
     or new.codigo_cracha is distinct from old.codigo_cracha
     or new.evento_id is distinct from old.evento_id then
    raise exception 'Só admin ou gestor altera o cadastro do lead.';
  end if;
  return new;
end $$;

-- ===================== supabase/migrations/0007_promotor_nao_registra_venda.sql =====================
-- ═════════════════════════════════════════════════════════════════════════
-- O promotor deixa de registrar venda.
--
-- A aba some da tela, mas esconder botão não é permissão: sem esta política
-- a inserção continuaria valendo por chamada direta à API, com a mesma
-- credencial que a pessoa já tem no navegador.
--
-- O papel fica sendo o que sempre foi na prática: LER a venda de todo mundo
-- para gerar contrato. Nada além disso.
-- ═════════════════════════════════════════════════════════════════════════

create or replace function public.registra_venda()
returns boolean language sql stable as $$
  select public.papel_atual() in ('admin', 'gestor', 'closer')
$$;

comment on function public.registra_venda is
  'Quem pode lançar venda. Exclui o promotor, que só lê e gera contrato.';

drop policy if exists vendas_insercao on public.vendas;
create policy vendas_insercao on public.vendas
  for insert to authenticated
  with check (public.registra_venda() and usuario_id = auth.uid());

-- ===================== supabase/migrations/0008_projetos.sql =====================
-- =========================================================================
-- Projetos da Bruxcon — a camada acima dos eventos.
--
-- O app nasceu para UM produto (DTC Master). Cada produto tem os próprios
-- eventos, a própria configuração de pontuação e, se vender pela Hotmart,
-- os próprios links de pagamento. Misturar o link de um produto no evento
-- de outro mandaria o cliente para o checkout errado — e a comissão junto.
--
-- Decisões:
--
-- - `projetos` é tabela, não enum. O enum `marca` servia só para a cor e
--   tinha três valores cravados; projeto novo não pode exigir migração.
--
-- - Cada evento pertence a UM projeto (`eventos.projeto_id`, NOT NULL).
--   Os eventos que já existem vão todos para o DTC Master — era o único
--   produto até aqui.
--
-- - O catálogo de ofertas da Hotmart vive no PROJETO (`projeto_ofertas`),
--   sem `sck`. Ao criar um evento, o app gera os links daquele evento a
--   partir do catálogo do projeto dele, trocando o `sck` por vendedor.
--   A tabela `links` (por evento) continua sendo o que o vendedor vê —
--   nada muda para quem já usa o app.
--
-- - Produtos, faixas e regras PADRÃO passam a ser do projeto. Um evento de
--   outro produto não pode nascer com "DTC Master" como produto.
--
-- - O `sck` do vendedor é o MESMO em todos os projetos (mesma conta Hotmart,
--   produtos diferentes) — por isso continua em `usuarios`, não no projeto.
-- =========================================================================

-- -- Coluna que o app já usava sem migração ------------------------------
-- `usuarios.aparece_ranking` é lida em lib/consultas.ts e escrita pelas
-- rotas /api/usuarios, mas nenhuma migração a criava (foi adicionada à mão
-- no painel). Em produção isto não faz nada; num banco novo, evita o erro.

alter table public.usuarios
  add column if not exists aparece_ranking boolean not null default true;

-- -- Projetos ------------------------------------------------------------

create table public.projetos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  slug        text not null unique,
  -- Até 4 letras: vai no quadrado do logo quando o projeto está selecionado.
  sigla       text not null,
  -- Cor da identidade (#RRGGBB). Vira `--brand` na tela.
  cor         text not null default '#0B3C5D',
  mentor      text,
  descricao   text,
  ativo       boolean not null default true,
  ordem       smallint not null default 0,

  -- Padrões herdados por todo evento novo do projeto.
  produtos    jsonb not null default '[]'::jsonb,
  faixas      jsonb not null default '[]'::jsonb,
  regras      jsonb not null default '[]'::jsonb,

  criado_em   timestamptz not null default now(),
  criado_por  text,

  constraint projetos_cor_hex check (cor ~* '^#[0-9a-f]{6}$'),
  constraint projetos_sigla_curta check (char_length(sigla) between 1 and 4)
);

comment on table public.projetos is
  'Produtos da Bruxcon (DTC Master…). Cada evento pertence a um projeto; o catálogo de ofertas da Hotmart é por projeto.';

-- -- Catálogo de ofertas do projeto (modelo, sem sck) --------------------
-- `url` é guardada SEM o parâmetro `sck`: é o molde. O link de cada
-- vendedor nasce daqui com o token da pessoa trocado (lib/links.ts).

create table public.projeto_ofertas (
  id          uuid primary key default gen_random_uuid(),
  projeto_id  uuid not null references public.projetos(id) on delete cascade,
  -- Código `off=` da Hotmart: é o que separa uma oferta da outra.
  oferta      text not null,
  url         text not null,
  valor       numeric(12, 2),
  condicao    text,
  ativo       boolean not null default true,
  ordem       smallint not null default 0,
  criado_em   timestamptz not null default now(),

  unique (projeto_id, oferta),
  constraint projeto_ofertas_sem_sck check (url !~* '[?&]sck=')
);

create index projeto_ofertas_projeto_idx on public.projeto_ofertas (projeto_id, ativo, ordem);

comment on table public.projeto_ofertas is
  'Catálogo-modelo de links da Hotmart por projeto, sem sck. Gera os links de cada evento.';

-- -- Projeto inicial ------------------------------------------------------
-- O DTC Master recebe exatamente as faixas e regras da v1 do Bruxcon
-- (o getPts e o FAIXA_LABELS do index.html antigo). Outros produtos da
-- Bruxcon entram pela tela de projetos.

insert into public.projetos (nome, slug, sigla, cor, mentor, ordem, produtos, faixas, regras)
values
  (
    'DTC Master', 'dtc-master', 'DTC', '#1A8A45', null, 1,
    '[{"id":"dtc-master","nome":"DTC Master"}]'::jsonb,
    '[{"label":"Abaixo de R$ 15.000","min":0,"max":14999.99},
      {"label":"R$ 15.000 até R$ 29.996","min":15000,"max":29996.99},
      {"label":"Acima de R$ 29.997","min":29997}]'::jsonb,
    '[{"id":"base","label":"Ponto recorrente (base)","tag":"1","pontos":1,"tipo":"base","ativo":true},
      {"id":"faixa-alta","label":"Recebido acima de R$ 15.000","tag":"+1","pontos":1,"tipo":"condicao",
       "condicoes":[{"campo":"faixaIndex","op":">=","valor":1}],"ativo":true},
      {"id":"completo","label":"Recebimento completo","tag":"+1","pontos":1,"tipo":"condicao",
       "condicoes":[{"campo":"completo","op":"é","valor":true}],"ativo":true},
      {"id":"segunda-cadeira","label":"2ª cadeira incluída","tag":"+½","pontos":0.5,"tipo":"condicao",
       "condicoes":[{"campo":"cadeira","op":"é","valor":true}],"ativo":true}]'::jsonb
  );

-- -- Eventos passam a pertencer a um projeto -----------------------------

alter table public.eventos
  add column projeto_id uuid references public.projetos(id) on delete restrict;

-- Tudo que já existe é do DTC Master.
update public.eventos
   set projeto_id = (select id from public.projetos where slug = 'dtc-master')
 where projeto_id is null;

alter table public.eventos alter column projeto_id set not null;

create index eventos_projeto_idx on public.eventos (projeto_id, status, data_inicio desc);

-- O slug do evento era único no app inteiro; agora basta ser único dentro
-- do projeto ("Imersão 2026" pode existir em dois projetos).
alter table public.eventos drop constraint if exists eventos_slug_key;
alter table public.eventos add constraint eventos_projeto_slug_key unique (projeto_id, slug);

comment on column public.eventos.marca is
  'Legado: a cor agora vem de projetos.cor. Mantida só para não quebrar consultas antigas.';

-- Evento com venda ou link não muda de projeto: os links dele são do
-- catálogo do projeto original, e mover levaria o checkout errado junto.
create or replace function public.impedir_troca_de_projeto()
returns trigger language plpgsql as $$
begin
  if new.projeto_id is distinct from old.projeto_id then
    if exists (select 1 from public.vendas where evento_id = old.id)
       or exists (select 1 from public.links where evento_id = old.id) then
      raise exception
        'Evento com vendas ou links não pode mudar de projeto. Crie um evento novo no projeto certo.';
    end if;
  end if;
  return new;
end $$;

create trigger eventos_impedir_troca_de_projeto
  before update on public.eventos
  for each row execute function public.impedir_troca_de_projeto();

-- -- Catálogo inicial do projeto, a partir dos links que já existem -----
-- Uma linha por oferta, com o `sck` tirado da URL. Se não houver links
-- ainda, não insere nada — o admin cadastra pela tela.

insert into public.projeto_ofertas (projeto_id, oferta, url, valor, condicao)
select distinct on (l.oferta)
       e.projeto_id,
       l.oferta,
       -- Remove `sck=...` preservando o resto (mesma lógica de removerSck em lib/links.ts).
       regexp_replace(
         regexp_replace(
           regexp_replace(l.url, '([?&])sck=[^&#]*&', '\1', 'i'),
           '[?&]sck=[^&#]*', '', 'i'),
         '\?$', ''),
       l.valor,
       l.condicao
  from public.links l
  join public.eventos e on e.id = l.evento_id
 order by l.oferta, e.data_inicio desc
on conflict (projeto_id, oferta) do nothing;

-- -- RLS -----------------------------------------------------------------
-- Mesmo desenho de `eventos` e `links`: a equipe lê, só admin escreve
-- (quem mexe no catálogo decide para onde vai o cliente e a comissão).

alter table public.projetos        enable row level security;
alter table public.projeto_ofertas enable row level security;

create policy projetos_leitura on public.projetos
  for select to authenticated using (public.eh_equipe());
create policy projetos_escrita on public.projetos
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

create policy projeto_ofertas_leitura on public.projeto_ofertas
  for select to authenticated using (public.eh_equipe());
create policy projeto_ofertas_escrita on public.projeto_ofertas
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- Realtime: cadastrar um projeto ou uma oferta precisa aparecer nos
-- aparelhos sem recarregar, como já acontece com eventos.
alter publication supabase_realtime add table public.projetos;
alter publication supabase_realtime add table public.projeto_ofertas;

-- ===================== supabase/migrations/0009_melhorias_operacao.sql =====================
-- =========================================================================
-- Melhorias de operacao trazidas do app Comercial Cris Miura - 0009
--
-- Reune, numa migracao so, o que la foram as migracoes 0008-0013 e 0015:
--
--   1. eventos.link_analise    - URL de um painel externo (Lead Score,
--                                check-in). Vira atalho no menu.
--   2. eventos.link_contratos  - URL base do sistema de assinatura de
--                                contratos. Preenchido, o botao "Contrato"
--                                da venda abre la o formulario ja com os
--                                dados da venda.
--   3. CEP em vendas e leads   - o contrato busca o endereco por ele.
--   4. inscritos               - base de inscritos com Lead Score, importada
--                                do painel de conversao. Alimenta as abas
--                                Analise e Participantes.
--   5. abordagens              - quem falou com quem no salao, e o que foi
--                                conversado. Historico por participante e
--                                contagem por vendedor.
--   6. admin corrige o vendedor da venda (lancada no login errado).
--
-- Tudo e aditivo: nenhuma coluna ou politica existente muda de sentido.
-- =========================================================================

-- -- 1 e 2. Links externos do evento -------------------------------------

alter table public.eventos
  add column if not exists link_analise   text,
  add column if not exists link_contratos text;

comment on column public.eventos.link_analise is
  'URL do painel de analise de dados do evento (dashboard externo, fora deste app). Opcional.';
comment on column public.eventos.link_contratos is
  'URL base do sistema de assinatura de contratos (externo). Opcional. Sem /novo no final.';

-- -- 3. CEP ---------------------------------------------------------------

alter table public.vendas add column if not exists cep text;
alter table public.leads  add column if not exists cep text;

comment on column public.vendas.cep is 'CEP do cliente. Vai para o contrato, que preenche o endereco.';
comment on column public.leads.cep  is 'CEP do participante (opcional, pode vir da importacao).';

-- -- 4. Inscritos com Lead Score ------------------------------------------
-- Tabela propria, nao colunas em `leads`: `leads` e a lista do cracha (quem
-- o closer aborda no salao). Inscrito e quem preencheu a inscricao, tenha
-- ou nao vindo. A chave e o e-mail, porque e o que liga inscrito <-> venda.
-- `extras` guarda o resto das colunas do painel sem virar 55 colunas aqui.

create table if not exists public.inscritos (
  evento_id        uuid not null references public.eventos(id) on delete cascade,
  email            text not null,                  -- minusculo, sem espacos
  nome             text not null,
  whatsapp         text,

  -- Lead Score (perfil 70% + comprometimento 30%). 'X' = nao respondeu.
  classe           text not null default 'X',
  nota             numeric,
  perfil           numeric,
  comprometimento  numeric,
  tipo             text,
  ja_aluno         boolean,

  -- Perfil declarado
  faturamento      text,
  idade            text,
  tempo_formado    text,
  area_atuacao     text,
  categoria_ticket text,
  tem_produto      boolean not null default false,
  produtos         text,

  -- Presenca
  checkin_feito    boolean not null default false,
  d1               boolean not null default false,
  d2               boolean not null default false,
  d3               boolean not null default false,

  -- Funil de contato
  ligou            boolean not null default false,
  resultado_ligacao text,
  contato_confirmou text,

  extras           jsonb not null default '{}'::jsonb,
  importado_em     timestamptz not null default now(),

  primary key (evento_id, email)
);

create index if not exists inscritos_evento_classe on public.inscritos (evento_id, classe);

alter table public.inscritos enable row level security;

-- Toda a equipe le: o closer consulta UMA pessoa antes de abordar (classe,
-- o que respondeu, se confirmou) - mesmo acesso que ja tem em `leads`.
-- Os agregados da aba Analise ficam limitados a admin/gestor na tela.
drop policy if exists inscritos_leitura on public.inscritos;
create policy inscritos_leitura on public.inscritos
  for select to authenticated using (public.eh_equipe());

-- Escrita: so pela API com a service role (ignora RLS). Nenhuma policy de
-- insert/update/delete de proposito.

comment on table public.inscritos is
  'Inscritos do evento com Lead Score, importados do painel de conversao. Chave: e-mail.';

-- -- 5. Abordagens --------------------------------------------------------
-- Uma linha por conversa. Sem FK para inscritos de proposito: a base de
-- inscritos e substituida inteira a cada reimportacao, e o historico de
-- conversas precisa sobreviver a isso.

create table if not exists public.abordagens (
  id           uuid primary key default gen_random_uuid(),
  evento_id    uuid not null references public.eventos(id) on delete cascade,
  email        text not null,
  usuario_id   uuid references public.usuarios(id) on delete set null,
  por_nome     text not null,
  observacao   text not null,
  em           timestamptz not null default now()
);

create index if not exists abordagens_evento_email   on public.abordagens (evento_id, email, em desc);
create index if not exists abordagens_evento_usuario on public.abordagens (evento_id, usuario_id);

alter table public.abordagens enable row level security;

drop policy if exists abordagens_leitura  on public.abordagens;
drop policy if exists abordagens_insercao on public.abordagens;
drop policy if exists abordagens_edicao   on public.abordagens;
drop policy if exists abordagens_exclusao on public.abordagens;

-- Toda a equipe le: o valor esta justamente em ver o que o colega ja falou.
create policy abordagens_leitura on public.abordagens
  for select to authenticated using (public.eh_equipe());

-- Cada um registra em seu proprio nome (senao dava para inflar a contagem
-- de abordagens de outra pessoa).
create policy abordagens_insercao on public.abordagens
  for insert to authenticated
  with check (public.eh_equipe() and usuario_id = auth.uid());

create policy abordagens_edicao on public.abordagens
  for update to authenticated
  using (public.eh_admin() or usuario_id = auth.uid())
  with check (public.eh_admin() or usuario_id = auth.uid());

create policy abordagens_exclusao on public.abordagens
  for delete to authenticated
  using (public.eh_admin() or usuario_id = auth.uid());

comment on table public.abordagens is
  'Conversas registradas com participantes do evento. Uma linha por abordagem; o historico sobrevive a reimportacao do painel.';

-- Registrar uma abordagem precisa aparecer na ficha do colega na hora.
alter publication supabase_realtime add table public.abordagens;

-- -- 6. Admin corrige o vendedor da venda ---------------------------------
-- A trava original (0001) impedia QUALQUER troca de dono. Continua valendo
-- para gestor, closer e promotor. O admin passa a poder corrigir: venda
-- lancada no login errado (celular emprestado no salao) hoje so se resolve
-- excluindo e refazendo, o que perde o historico e a auditoria.
-- Mover venda para outro evento continua proibido para todos.

create or replace function public.impedir_troca_de_dono()
returns trigger language plpgsql as $$
begin
  if new.usuario_id is distinct from old.usuario_id and not public.eh_admin() then
    raise exception 'Nao e permitido transferir a venda para outro vendedor.';
  end if;
  if new.evento_id is distinct from old.evento_id then
    raise exception 'Nao e permitido mover a venda para outro evento.';
  end if;
  return new;
end $$;

comment on function public.impedir_troca_de_dono is
  'Trava a troca de evento para todos e a troca de vendedor para todos, menos admin (correcao de venda lancada no login errado).';

-- ===================== supabase/migrations/0010_links_automaticos.sql =====================
-- =========================================================================
-- Catalogo de links automatico, POR PROJETO - 0010
--
-- Ideia trazida do app Comercial Cris Miura (migracao 0014 de la): o link
-- de pagamento se propaga sozinho, sem ninguem recadastrar 80 ofertas a
-- cada evento ou a cada vendedor novo.
--
-- A diferenca essencial aqui: a fonte NAO e "o evento com mais ofertas"
-- (isso misturaria produtos diferentes). A fonte e `projeto_ofertas` do
-- projeto DO EVENTO. Um evento do DTC Master so recebe ofertas do DTC Master.
--
--   * evento novo   -> recebe o catalogo do projeto dele, para "Casa" e para
--                      todos os vendedores ativos;
--   * usuario novo  -> recebe o catalogo de todos os eventos que ja existem,
--                      cada evento com o catalogo do proprio projeto;
--   * oferta nova   -> entra em todos os eventos daquele projeto.
--
-- Token de cada vendedor: `usuarios.sck`; vazio, usa o primeiro nome sem
-- acento (mesma regra do app da Cris, com o acento tirado). "Casa" fica SEM sck - link sem dono nao pode
-- carregar o rastreio de quem por acaso estava na URL.
--
-- Tudo `on conflict do nothing`: link que ja existe nunca e sobrescrito.
-- Quem quer regerar usa a tela (Links -> Gerir).
-- =========================================================================

-- -- 0. Token padrao de quem nao tem sck: primeiro nome, sem acento --------
-- O sck vai dentro da URL e e conferido a olho na Hotmart: acento vira
-- escape ilegivel la. Mesma regra de validarSck em lib/links.ts.

create or replace function public.sck_padrao(p_nome text)
returns text language sql immutable as $$
  select regexp_replace(
    translate(split_part(trim(p_nome), ' ', 1),
      'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCN'),
    '[^A-Za-z0-9._-]', '', 'g')
$$;

-- -- 1. Destinatarios: Casa + quem pode vender ----------------------------

create or replace function public.destinos_de_links()
returns table (nome text, sck text)
language sql stable security definer set search_path = public as $$
  select 'Casa'::text, null::text
  union all
  select u.nome, coalesce(nullif(trim(u.sck), ''), public.sck_padrao(u.nome))
    from public.usuarios u
   where u.ativo and u.papel in ('admin', 'gestor', 'closer')
$$;

-- -- 2. Montar a URL com o token (mesma logica de trocarSck em lib/links.ts)

create or replace function public.url_com_sck(p_url text, p_sck text)
returns text language sql immutable as $$
  select case
    when p_sck is null or p_sck = '' then p_url
    else p_url || case when p_url like '%?%' then '&' else '?' end || 'sck=' || p_sck
  end
$$;

-- -- 3. Semear um evento a partir do catalogo do projeto dele -------------

create or replace function public.semear_links_do_evento(p_evento_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  insert into public.links (evento_id, vendedor_nome, sck, status, oferta, valor, condicao, url)
  select e.id, d.nome, d.sck, 'new', o.oferta, o.valor, o.condicao, public.url_com_sck(o.url, d.sck)
    from public.eventos e
    join public.projeto_ofertas o on o.projeto_id = e.projeto_id and o.ativo
    cross join public.destinos_de_links() d
   where e.id = p_evento_id
  on conflict (evento_id, oferta, vendedor_nome) do nothing;

  get diagnostics n = row_count;
  return n;
end $$;

comment on function public.semear_links_do_evento is
  'Cria os links de um evento a partir do catalogo do PROJETO dele, para Casa e todos os vendedores ativos. Nao toca em link que ja existe.';

-- -- 4. Semear um vendedor em todos os eventos ----------------------------

create or replace function public.semear_links_do_vendedor(p_usuario_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_nome text;
  v_sck  text;
  n integer;
begin
  select u.nome, coalesce(nullif(trim(u.sck), ''), public.sck_padrao(u.nome))
    into v_nome, v_sck
    from public.usuarios u
   where u.id = p_usuario_id and u.ativo and u.papel in ('admin', 'gestor', 'closer');

  if v_nome is null then return 0; end if;

  insert into public.links (evento_id, vendedor_nome, sck, status, oferta, valor, condicao, url)
  select e.id, v_nome, v_sck, 'new', o.oferta, o.valor, o.condicao, public.url_com_sck(o.url, v_sck)
    from public.eventos e
    join public.projeto_ofertas o on o.projeto_id = e.projeto_id and o.ativo
  on conflict (evento_id, oferta, vendedor_nome) do nothing;

  get diagnostics n = row_count;
  return n;
end $$;

-- -- 5. Semear uma oferta nova em todos os eventos do projeto -------------

create or replace function public.semear_links_da_oferta(p_oferta_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  insert into public.links (evento_id, vendedor_nome, sck, status, oferta, valor, condicao, url)
  select e.id, d.nome, d.sck, 'new', o.oferta, o.valor, o.condicao, public.url_com_sck(o.url, d.sck)
    from public.projeto_ofertas o
    join public.eventos e on e.projeto_id = o.projeto_id
    cross join public.destinos_de_links() d
   where o.id = p_oferta_id and o.ativo
  on conflict (evento_id, oferta, vendedor_nome) do nothing;

  get diagnostics n = row_count;
  return n;
end $$;

-- -- 6. Gatilhos ----------------------------------------------------------

create or replace function public.ao_criar_evento_semear_links()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.semear_links_do_evento(new.id);
  return new;
end $$;

drop trigger if exists eventos_semear_links on public.eventos;
create trigger eventos_semear_links
  after insert on public.eventos
  for each row execute function public.ao_criar_evento_semear_links();

create or replace function public.ao_criar_usuario_semear_links()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.semear_links_do_vendedor(new.id);
  return new;
end $$;

drop trigger if exists usuarios_semear_links on public.usuarios;
create trigger usuarios_semear_links
  after insert on public.usuarios
  for each row execute function public.ao_criar_usuario_semear_links();

create or replace function public.ao_criar_oferta_semear_links()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.semear_links_da_oferta(new.id);
  return new;
end $$;

drop trigger if exists projeto_ofertas_semear_links on public.projeto_ofertas;
create trigger projeto_ofertas_semear_links
  after insert on public.projeto_ofertas
  for each row execute function public.ao_criar_oferta_semear_links();

-- -- 7. Preencher o que ja existe -----------------------------------------
-- Roda uma vez, agora: todo evento recebe o que faltar do catalogo do
-- proprio projeto. Link existente nao e tocado.

do $$
declare
  ev record;
  total integer := 0;
  n integer;
begin
  for ev in select e.id, e.nome, p.sigla from public.eventos e join public.projetos p on p.id = e.projeto_id loop
    n := public.semear_links_do_evento(ev.id);
    total := total + n;
    raise notice '[%] "%": % links criados.', ev.sigla, ev.nome, n;
  end loop;
  raise notice 'Total: % links.', total;
end $$;

-- Conferencia: links por projeto, evento e vendedor
select p.sigla as projeto, e.nome as evento, l.vendedor_nome, count(*) as links
  from public.links l
  join public.eventos e on e.id = l.evento_id
  join public.projetos p on p.id = e.projeto_id
 group by p.sigla, e.nome, l.vendedor_nome
 order by p.sigla, e.nome, l.vendedor_nome;


-- ===================== registro das migrações aplicadas à mão =====================
-- A integração GitHub do Supabase (e o `supabase db push`) consulta esta
-- tabela: versão registrada aqui não é aplicada de novo.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version    text primary key,
  statements text[],
  name       text
);
insert into supabase_migrations.schema_migrations (version, name) values
  ('0001', 'esquema_inicial'),
  ('0002', 'realtime'),
  ('0003', 'rastro_de_acesso'),
  ('0004', 'papel_promotor'),
  ('0005', 'permissoes_do_promotor'),
  ('0006', 'corrigir_trava_do_lead'),
  ('0007', 'promotor_nao_registra_venda'),
  ('0008', 'projetos'),
  ('0009', 'melhorias_operacao'),
  ('0010', 'links_automaticos')
on conflict (version) do nothing;

-- Conferência: deve listar o projeto DTC Master.
select * from public.projetos;
