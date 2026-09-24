# Anúncio de Ocorrência de Destaque — CBMMG

Ferramenta que gera o Anúncio de Ocorrência de Destaque a partir da
descrição livre de uma ocorrência, seguindo os critérios do Memorando
nº 3.200 - CBMMG/BM3 (17/08/2026). Front-end estático (`index.html`) +
back-end em Supabase Edge Function: a chave da API fica só no servidor,
nunca no navegador.

Idealizado originalmente pelo 3º Sgt BM Luiz Eduardo — esta versão é uma
evolução do sistema que ele criou.

## Por que Groq

O texto é gerado pela **API gratuita da Groq**, rodando o modelo
Llama 3.3 70B. Comparado com as alternativas já testadas neste projeto:

- **Sem custo**, sem cartão de crédito.
- **Não usa os dados para treinar modelo, nem no nível gratuito nem no
  pago** — diferente do Gemini, cuja proteção só existe no nível pago.
  Isso importa porque os relatos de ocorrência enviados aqui podem
  incluir vítimas, menores de idade, óbitos ou suspeita de ilícito
  penal — exatamente o que o item 8.1/8.2 do Memorando nº 3.200 pede
  para proteger. Fonte: https://groq.com/privacy-policy
- **Limite de requisições bem mais folgado** que o Gemini gratuito
  (na faixa de 30/minuto e 1.000/dia), reduzindo os erros de "alta
  demanda" que tínhamos antes.

**Limitação atual:** o modelo usado (`llama-3.3-70b-versatile`) só lê
texto — não processa foto nem PDF. O botão de anexo no app fica
desabilitado por enquanto. Trocar por um modelo da Groq com visão é um
possível próximo passo (ver seção final).

## Como funciona

```
navegador (index.html)  --fetch-->  Supabase Edge Function  --fetch-->  API da Groq
                                     (guarda GROQ_API_KEY)
```

O front-end nunca fala direto com a Groq. Ele manda o histórico da
conversa (`turns`) para a Edge Function, que injeta as regras do
Memorando 3.200 como mensagem de sistema, chama a API e devolve só o
texto gerado.

## Pré-requisitos

- Uma conta no [Supabase](https://supabase.com).
- [Supabase CLI](https://supabase.com/docs/guides/cli) — no Windows,
  use `npx supabase <comando>` em vez de instalar globalmente (evita
  problema de política de execução do PowerShell).
- Uma chave de API da Groq, gerada gratuitamente em
  [console.groq.com/keys](https://console.groq.com/keys) — não pede
  cartão de crédito.
- Uma conta no GitHub.

## 1. Gerar a chave da Groq

1. Acesse **https://console.groq.com/keys** e entre (pode ser com
   conta Google).
2. Clique em **"Create API Key"**, dê um nome (ex.: `anuncio-destaque`).
3. Copie a chave gerada (começa com `gsk_...`) e guarde num lugar
   seguro.

## 2. Publicar a Edge Function

```bash
# Dentro da pasta deste projeto
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF

npx supabase secrets set GROQ_API_KEY=SUA_CHAVE_AQUI --project-ref SEU_PROJECT_REF

npx supabase functions deploy gerar-anuncio --project-ref SEU_PROJECT_REF
```

Ao final do deploy, a CLI mostra a URL da função — algo como:

```
https://SEU_PROJECT_REF.functions.supabase.co/gerar-anuncio
```

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
git commit -m "Anuncio de Ocorrencia de Destaque"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git push -u origin main
```

## 5. Publicar o front-end (GitHub Pages)

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
│   ├── luiz-eduardo.png                    # foto usada no painel de homenagem
│   └── favicon-cbmmg.png                   # brasão do CBMMG, usado como favicon
└── supabase/
    └── functions/
        └── gerar-anuncio/
            └── index.ts                    # Edge Function — chama a Groq com a chave protegida
```

## Testando localmente antes de publicar

```bash
npx supabase functions serve gerar-anuncio --env-file supabase/.env.local
```

Crie `supabase/.env.local` (não versionar — já está no `.gitignore`)
com:

```
GROQ_API_KEY=sua-chave-aqui
```

E aponte `EDGE_FUNCTION_URL` no `index.html` para
`http://localhost:54321/functions/v1/gerar-anuncio` enquanto testa
localmente.

## O que ainda não tem (próximos passos possíveis)

- **Anexar foto/PDF de novo**: trocar `llama-3.3-70b-versatile` por um
  modelo da Groq com visão (ex.: linhagem Llama 4 Scout/Maverick,
  conferir nome atual em console.groq.com/docs/models) e reativar o
  botão de anexo, que já está implementado no front-end (só
  desabilitado).
- **Ditado por voz**: já funciona (usa a função do navegador, sem
  custo e sem depender do provedor de IA).
- **Histórico persistente**: hoje a conversa vive só na memória da
  aba aberta. Dá pra guardar no Postgres do Supabase se quiser
  consultar depois quem gerou o quê.
- **Autenticação**: qualquer pessoa com a URL do site consegue gerar
  anúncios. Se quiser restringir ao pessoal do COBOM, dá pra usar o
  Supabase Auth.
- **Streaming da resposta**: a versão atual espera a resposta
  completa antes de mostrar.
