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
