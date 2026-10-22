# Bruxcon Comercial

App do time comercial da **Bruxcon** (International Bruxism Convention):
registro de vendas, pontuação, ranking, metas, contrato e links de
pagamento nos eventos de cada **produto** — hoje o **DTC Master**.
Usado no celular, em pé, no salão do evento — por isso tudo é coluna única,
alvo de toque grande e fonte 16px nos campos (abaixo disso o Safari do iPhone
dá zoom sozinho ao focar).

> **v2.** Até aqui o Bruxcon era um `index.html` único com Firebase (está no
> histórico do git). Esta versão
> traz para cá a base do app **AVA Comercial**, que nasceu justamente dessa
> v1: o que lá era constante de código (`EMAIL_MAP`, `CLOSERS`,
> `FAIXA_LABELS`, `getPts`) virou dado no banco. A pontuação e as faixas do
> DTC Master continuam exatamente as mesmas. O Firebase saiu: tudo roda no
> Supabase, começando do zero. Ver [`BANCO-DE-DADOS.md`](BANCO-DE-DADOS.md).

## Projeto → evento

A hierarquia é **projeto (produto) → evento → vendas/links/leads**. Ao
entrar, a pessoa escolhe o produto; daí em diante só enxerga os eventos
dele, e tudo o que registra fica dentro dele.

O que é do projeto:

- **Cor e sigla** — o app muda de cor conforme o projeto selecionado
  (DTC Master: verde `#1A8A45`).
- **Produto, faixas e regras padrão** — todo evento novo nasce com eles.
- **Catálogo de ofertas da Hotmart** (`projeto_ofertas`) — opcional. A URL
  de cada oferta, **sem `sck`**. Ao criar um evento, o app gera os links do
  time a partir do catálogo do projeto, trocando o token de cada vendedor.

O `sck` do vendedor é o mesmo em todos os projetos, por isso fica no
cadastro do usuário.

**Next.js 15 (App Router, TypeScript) + Tailwind 4 + Supabase.**
Ver [`BANCO-DE-DADOS.md`](BANCO-DE-DADOS.md) para subir o banco do zero.

## As telas

| | |
|---|---|
| **Registrar** | O closer lança a venda; a pontuação sai ao vivo, pelas regras **do evento** |
| **Ranking** | Placar em tempo real, com meta, quanto falta e projeção de fechamento |
| **Pontos** | Visão do próprio vendedor — ele não vê o volume dos colegas |
| **Vendas** | Histórico, edição e geração do texto de contrato |
| **Contrato** | Só do promotor: monta o parcelamento em campos e recebe o texto formal |
| **Links** | Links de pagamento da Hotmart por vendedor; admin gera do catálogo do projeto |
| **Usuários** | Cadastrar, editar, desativar e excluir acesso (só admin) |
| **Projetos** | Escolher o projeto; admin cadastra projetos e o catálogo de ofertas de cada um |
| **Participantes** | Ficha de cada inscrito (Lead Score, presença, o que respondeu) e histórico de abordagens |
| **Análise** | Agregados do evento: MQL, conversão por classe, presença por dia, abordagens por vendedor (admin/gestor) |

## Rodar

```bash
npm install
cp .env.example .env.local   # preencha as chaves
npm run dev
```

A leitura de QR precisa de HTTPS. Em `localhost` funciona; em rede local, use
um túnel.

```bash
npm test        # 175 testes das regras de negócio
npm run build
```

## Onde está a lógica que importa

Três arquivos concentram o que não pode errar, e os três são função pura,
testados sem subir tela nem banco:

**`src/lib/pontuacao.ts`** — motor de pontuação. Cada evento define as próprias
regras (`base`, `condição`, `por faixa`, `proporcional`) e elas são avaliadas
por um interpretador. Regra vem do banco, então é dado: sem `eval`, sem
`new Function`. Mudar o cálculo altera comissão de gente — por isso a suíte
de paridade.

**`src/lib/parcelamento.ts`** — plano de pagamento do contrato. Dinheiro é
comparado em **centavos**: em float, `0,1 + 0,2` acusa diferença onde não há e
o usuário vê "não bate" sem entender. Ao dividir um valor em N parcelas, a
última absorve os centavos — senão R$ 25.964 em 3 fecha em R$ 25.964,01 e o
plano trava por um centavo.

**`src/lib/links.ts`** — manipulação das URLs da Hotmart. O parâmetro `sck` é
quem recebe a comissão. Trocá-lo errado desvia dinheiro em silêncio — por isso
toda manipulação passa por aqui, testada. Um dos testes cobre o caso mais
traiçoeiro: o link "de casa" (sem dono) precisa sair **sem** rastreio, e não
com o rastreio de quem por acaso estava na URL copiada. `gerarLinksDoCatalogo`
é a função que transforma o catálogo do projeto nos links de um evento.

## Detalhes que parecem estranhos e não são

- **A pontuação fica congelada na venda** (`pontos_detalhe`). Mudar a regra
  depois não reescreve o ranking sozinho — isso deixaria o time sem entender
  de onde vieram os pontos.
- **`vendas.closer_nome` é desnormalizado**, mesmo havendo `usuario_id`. O
  histórico continua legível se o cadastro mudar ou sumir.
- **`eventos.projeto_id` não muda depois que o evento tem venda ou link.**
  Trigger no banco. Os links do evento vieram do catálogo daquele projeto;
  mover o evento levaria o checkout errado junto.
- **`projeto_ofertas.url` não aceita `sck`.** Constraint no banco: o
  catálogo é o molde, sem dono. O token entra só ao gerar o link do evento.
- **`links.vendedor_nome` é texto, não chave estrangeira.** A base pode trazer
  nomes que nunca existiram como usuário do app (herança do arquivo da
  Hotmart), e forçar a junção perderia link.
- **A auditoria não tem chave estrangeira para vendas.** É de propósito: o
  rastro precisa sobreviver à exclusão da venda, que é justamente quando ele
  importa.
- **O id da venda é gerado no cliente.** Dois toques no botão viram o mesmo
  registro, não duas vendas.

## Design

Tokens em `src/app/globals.css`: papel quente `#F4F2EC`, tinta `#1C1D18`,
`--brand` é a cor do **projeto** selecionado (DTC Master `#1A8A45`; sem
projeto, o verde-escuro da Bruxcon `#0A1A0F`), serifa no display, mono nos números. Tema
claro único, por decisão de projeto.

Componentes em `src/components/ui/`. Use `.inp` para campos em vez de
utilitários soltos — ela carrega as regras que o mobile exige.

## Integrações

- **Gemini** (`src/lib/gemini.ts`) gera o texto do plano de pagamento. O modelo
  vem de `GEMINI_MODEL` e há uma fila de candidatos: modelo cravado no código
  já foi descontinuado uma vez em produção e derrubou a função em silêncio. Se
  todos falharem, o erro lista os modelos que a chave alcança.
- **Hotmart**: só os links de pagamento, sem API. O `sck` na URL é o rastreio.
  O catálogo se propaga sozinho por gatilho no banco (migração 0010), sempre
  dentro do projeto do evento.
- **Sistema de contratos** (`src/lib/contrato-externo.ts`): se o evento tiver
  `link_contratos`, o botão Contrato abre lá o formulário já com os dados da
  venda na URL (nome, CPF, CEP, valor, modalidade).
- **Painel de conversão**: o `index.html` do painel de Lead Score é importado
  na aba Análise (`/api/inscritos/importar`) e vira a base de `inscritos`.

## Scripts

`scripts/` tem as ferramentas de manutenção — importar participantes por
planilha, cadastrar a equipe da v1 (`criar-usuarios.mjs`), gerar catálogo de links para um vendedor, distribuir uma oferta para
todos, corrigir código de oferta, resetar senha.

Todos são **simulação por padrão** e só gravam com `--apply`.
