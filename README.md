# Anúncio de Ocorrência de Destaque — CBMMG

Ferramenta que gera o Anúncio de Ocorrência de Destaque a partir da
descrição livre de uma ocorrência, seguindo os critérios do Memorando
nº 3.200 - CBMMG/BM3 (17/08/2026). Front-end estático (`index.html`) +
back-end em Supabase Edge Function, no mesmo padrão do TapFlow: a chave
da API fica só no servidor, nunca no navegador.

Idealizado originalmente pelo 3º Sgt BM Luiz Eduardo — esta versão é uma
evolução do sistema que ele criou.

## ⚠️ Decisão de privacidade já tomada — leia antes de usar

Este projeto usa a **API gratuita do Gemini (Google)** em vez da API da
Anthropic, por restrição orçamentária (o Estado não provê verba para
esse tipo de iniciativa). Isso tem um efeito colateral que **já foi
avaliado e aceito conscientemente**:

> No nível gratuito da API do Gemini, o Google pode usar os prompts e
> respostas enviados para melhorar seus produtos (revisão humana
> inclusive). Essa proteção só existe no nível pago, com faturamento
> ativado. Fonte oficial: https://ai.google.dev/gemini-api/terms

Ou seja: os relatos de ocorrência enviados a este sistema — que podem
incluir vítimas, menores de idade, óbitos ou suspeita de ilícito penal —
passam a trafegar pelo Google nessas condições. Isso é uma tensão direta
com o item 8.1/8.2 do próprio Memorando nº 3.200 (proteção de dados dos
envolvidos). A decisão de seguir assim, mesmo com essa ressalva, já foi
tomada pela equipe. Se um dia houver orçamento disponível, migrar para
o nível pago do Gemini (ou voltar para a Anthropic) elimina esse ponto.

## Como funciona

```
navegador (index.html)  --fetch-->  Supabase Edge Function  --fetch-->  API do Gemini (Google)
                                     (guarda GEMINI_API_KEY)
```

O front-end nunca fala direto com o Gemini. Ele manda o histórico da
conversa (`turns`) para a Edge Function, que injeta as regras do
Memorando 3.200 como instrução de sistema, chama a API e devolve só o
texto gerado.

## Pré-requisitos

- Uma conta no [Supabase](https://supabase.com) (pode ser o mesmo
  projeto do TapFlow, ou um novo).
- [Supabase CLI](https://supabase.com/docs/guides/cli) — no Windows,
  use `npx supabase <comando>` em vez de instalar globalmente (evita
  problema de política de execução do PowerShell).
- Uma chave de API do Gemini, gerada gratuitamente em
  [aistudio.google.com/apikey](https://aistudio.google.com/apikey) —
  não pede cartão de crédito no nível gratuito.
- Uma conta no GitHub.

## 1. Gerar a chave do Gemini

1. Acesse **https://aistudio.google.com/apikey** e entre com uma conta
   Google.
2. Clique em **"Create API key"**.
3. Escolha ou crie um projeto do Google Cloud quando pedir (pode aceitar
   as opções padrão).
4. Copie a chave gerada — ela não tem o prefixo `sk-ant-` do exemplo
   antigo, é só uma sequência de caracteres. Guarde num lugar seguro.

## 2. Publicar a Edge Function

```bash
# Dentro da pasta deste projeto
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF

npx supabase secrets set GEMINI_API_KEY=SUA_CHAVE_AQUI --project-ref SEU_PROJECT_REF

npx supabase functions deploy gerar-anuncio --project-ref SEU_PROJECT_REF
```

Ao final do deploy, a CLI mostra a URL da função — algo como:

```
https://SEU_PROJECT_REF.functions.supabase.co/gerar-anuncio
```

Guarde essa URL para o próximo passo.

## 3. Apontar o front-end para a função

Abra `index.html`, procure por `EDGE_FUNCTION_URL` (logo no início da
tag `<script>`) e cole a URL real:

```js
var EDGE_FUNCTION_URL = "https://SEU_PROJECT_REF.functions.supabase.co/gerar-anuncio";
```

## 4. Subir para o GitHub

```bash
git init
git add .
git commit -m "Anúncio de Ocorrência de Destaque (Gemini)"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git push -u origin main
```

## 5. Publicar o front-end

**GitHub Pages** (grátis, direto do repositório):
1. No GitHub, vá em **Settings → Pages**.
2. Em "Build and deployment", escolha **Deploy from a branch**, branch
   `main`, pasta `/ (root)`.
3. Salve — em alguns minutos o site fica disponível em
   `https://SEU_USUARIO.github.io/SEU_REPOSITORIO/`.

## 6. Travar o CORS (recomendado, depois de testar)

Edite `supabase/functions/gerar-anuncio/index.ts`, troque:

```ts
const ALLOWED_ORIGIN = "*";
```

pelo domínio real do seu front-end, ex.:

```ts
const ALLOWED_ORIGIN = "https://SEU_USUARIO.github.io";
```

e rode `npx supabase functions deploy gerar-anuncio --project-ref SEU_PROJECT_REF`
de novo.

## Estrutura do projeto

```
.
├── index.html                              # front-end (chat + regras de exibição)
├── assets/
│   └── luiz-eduardo.png                    # foto usada no painel de homenagem
└── supabase/
    └── functions/
        └── gerar-anuncio/
            └── index.ts                    # Edge Function — chama o Gemini com a chave protegida
```

## Testando localmente antes de publicar

```bash
npx supabase functions serve gerar-anuncio --env-file supabase/.env.local
```

Crie `supabase/.env.local` (não versionar — já está no `.gitignore`)
com:

```
GEMINI_API_KEY=sua-chave-aqui
```

E aponte `EDGE_FUNCTION_URL` no `index.html` para
`http://localhost:54321/functions/v1/gerar-anuncio` enquanto testa
localmente.

## O que ainda não tem (próximos passos possíveis)

- **Anexar foto/PDF direto no Gemini**: diferente da Anthropic, a API
  do Gemini aceita imagem e PDF de forma nativa na própria chamada
  (sem precisar da extração client-side com pdf.js que fizemos na
  versão do claude.ai). Dá pra portar essa função pra cá de um jeito
  até mais simples.
- **Ditado por voz**: a versão do claude.ai já tem (usa a função do
  navegador, sem custo); ainda não foi portada para este front-end.
- **Histórico persistente**: hoje a conversa vive só na memória da
  aba aberta. Dá pra guardar no Postgres do Supabase se quiser
  consultar depois quem gerou o quê.
- **Autenticação**: qualquer pessoa com a URL do site consegue gerar
  anúncios. Se quiser restringir ao pessoal do COBOM, dá pra usar o
  Supabase Auth.
- **Streaming da resposta**: a versão atual espera a resposta
  completa antes de mostrar.
- **Migrar para o nível pago do Gemini** (ou voltar pra Anthropic) se
  algum dia houver orçamento — resolve a ressalva de privacidade do
  topo deste documento.
