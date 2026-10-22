# Subindo o banco do zero

Este projeto nasce com o banco **vazio** e roda só no Supabase. As vendas
do Bruxcon v1 (Firebase) não são copiadas: a operação começa do zero.

## Passo a passo

1. Crie um projeto no [Supabase](https://supabase.com).
2. Copie URL, anon key e service role key para o `.env.local`
   (ver `.env.example`).
3. Aplique as migrações, na ordem:

```bash
npm run db:aplicar supabase/migrations/0001_esquema_inicial.sql
npm run db:aplicar supabase/migrations/0002_realtime.sql
npm run db:aplicar supabase/migrations/0003_rastro_de_acesso.sql
npm run db:aplicar supabase/migrations/0004_papel_promotor.sql
npm run db:aplicar supabase/migrations/0005_permissoes_do_promotor.sql
npm run db:aplicar supabase/migrations/0006_corrigir_trava_do_lead.sql
npm run db:aplicar supabase/migrations/0007_promotor_nao_registra_venda.sql
npm run db:aplicar supabase/migrations/0008_projetos.sql
npm run db:aplicar supabase/migrations/0009_melhorias_operacao.sql
npm run db:aplicar supabase/migrations/0010_links_automaticos.sql
```

A `0008` cria o projeto **DTC Master** com as faixas e regras da v1
(base 1 · +1 recebido acima de R$ 15.000 · +1 recebimento completo ·
+½ 2ª cadeira; faixas até R$ 14.999, R$ 15.000–29.996 e acima de R$ 29.997).

A `0009` traz as melhorias de operação (vindas do app Comercial Cris Miura):
links externos no evento (painel de análise e sistema de contratos), CEP,
tabelas `inscritos` (Lead Score) e `abordagens`, e o admin passa a poder
corrigir o vendedor de uma venda.

A `0010` faz o catálogo de links se propagar sozinho, **por projeto**:
evento novo recebe o catálogo do projeto dele; usuário novo recebe os
links de todos os eventos; oferta nova entra em todos os eventos do
projeto. Quem não tem `sck` recebe o primeiro nome, sem acento.

4. Cadastre a equipe da v1 (o antigo `EMAIL_MAP`) — cada um recebe senha
   temporária e troca no primeiro acesso:

```bash
node scripts/criar-usuarios.mjs            # simulação
node scripts/criar-usuarios.mjs --apply    # anote as senhas impressas
```

   Gente nova depois disso entra pela tela de Usuários.
5. Entre no app, escolha **DTC Master** e cadastre o evento pela tela
   (ex.: slug `bruxcon-2026`). Se o Bruxcon vender por link da Hotmart,
   cadastre antes o catálogo de ofertas no ícone de link do projeto.
6. Participantes e Análise: importe a planilha .xlsx na tela de importação e
   suba o `index.html` do painel de conversão na aba Análise.

## Sem terminal: pelo SQL Editor do Supabase

As migrações do banco de produção do Bruxcon foram aplicadas **à mão**, pelo
SQL Editor, com os arquivos de `supabase/manual/` (mesmo conteúdo das
migrações, só agrupado). Rode um por vez, na ordem, cada um num Run:

1. `parte1-migracoes-0001-0004.sql`
2. `parte2-migracoes-0005-0010.sql` — no fim registra 0001–0010 em
   `supabase_migrations.schema_migrations`, para a integração GitHub do
   Supabase não aplicá-las de novo quando o PR entrar na `main`. O
   resultado mostra o projeto DTC Master com as faixas e regras.
3. `parte3-cadastrar-equipe.sql` — faz o mesmo que `criar-usuarios.mjs` e
   mostra as senhas temporárias. Anote na hora.

A 0004 (`alter type ... add value`) fica no fim da parte 1 porque o valor
novo não pode ser usado no mesmo Run em que é criado.

Migração nova daqui em diante: crie o arquivo em `supabase/migrations/` e
aplique por um caminho só (integração no merge **ou** à mão + registro na
`schema_migrations`), nunca pelos dois.

## Publicar no Netlify

O `netlify.toml` já está pronto (`npm run build` + plugin do Next.js).
Antes do primeiro deploy desta versão, cadastre em *Site configuration >
Environment variables* as chaves do `.env.example`. Sem elas o app abre
uma tela explicando o que falta, em vez de quebrar.

## As regras de acesso

`supabase/migrations/0001_esquema_inicial.sql` tem o modelo de dados e as
políticas de permissão em SQL, comentadas decisão a decisão.

| Papel | Pode |
|---|---|
| `admin` | Tudo: projetos e catálogo de ofertas, usuários, eventos, regras de pontuação, excluir vendas |
| `gestor` | Vê e edita tudo do evento, sem mexer no time nem nas regras |
| `closer` | Registra e edita as **próprias** vendas; vê os próprios pontos |
| `promotor` | Lê a venda de todos para gerar contrato; não registra venda; sem ranking e sem totais |

Três garantias que valem manter, porque cada uma nasceu de um problema real:

1. **Ninguém transfere uma venda para outro dono.** Seria roubar ponto no
   ranking.
2. **O promotor só grava o campo do contrato em venda de outra pessoa.** Sem
   esse limite, quem gera contrato poderia reescrever valor e pontuação de
   qualquer venda do evento.
3. **Usuário com venda não pode ser excluído, só desativado.** Chave
   estrangeira `ON DELETE RESTRICT` no Postgres.

## Dado sensível

`leads` guarda CPF, telefone e e-mail de participantes reais. Trate qualquer
exportação como confidencial e nunca a suba em repositório público.
