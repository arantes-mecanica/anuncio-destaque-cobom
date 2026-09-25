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
`openai/gpt-oss-120b` (modelo aberto da OpenAI). Comparado com as alternativas já testadas neste projeto:

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

**Limitação atual:** o modelo usado (`openai/gpt-oss-120b`) só lê
texto — não processa foto nem PDF. O botão de anexo no app fica
desabilitado por enquanto. Trocar por um modelo da Groq com visão é um
possível próximo passo (ver seção final).

## Como funciona

```
navegador (index.html)  --fetch-->  Supabase Edge Function  --fetch-->  API da Groq
                                     (guarda GROQ_API_KEY)
```

A mesma função também guarda o último texto de cada anúncio na tabela
`public.anuncios` do Postgres do Supabase (ver "Histórico de anúncios"
abaixo).

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

## 2.1. Criar a tabela do histórico

```bash
npx supabase db push --project-ref SEU_PROJECT_REF
```

Isso aplica `supabase/migrations/20260924120000_anuncios.sql`. Também
funciona colar esse SQL no **SQL Editor** do painel do Supabase. A função
usa `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, que o Supabase já
injeta sozinho: não precisa criar esses secrets.

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

## Histórico de anúncios e deliberação do CBU

- Todo anúncio sai como **OCORRÊNCIA DE RELEVÂNCIA**. O campo
  ENQUADRAMENTO é o assessoramento do COBOM ao CBU (itens 3.x possíveis).
- Quando o CBU delibera destaque, marque **CBU deliberou destaque**: o
  título vira `*OCORRÊNCIA DE DESTAQUE*` na hora, sem chamar a Groq, e o
  registro é atualizado. As atualizações seguintes continuam Destaque.
- Cada anúncio gerado fica salvo (só o texto final, nunca a conversa nem
  o texto de PDFs anexados) e aparece no botão **Histórico** por **48h a
  partir da data do fato** (campo DATA/HORA DO INÍCIO DA OCORRÊNCIA). Sem
  data informada, as 48h contam da criação. Abrir um anúncio carrega o
  texto na conversa. A próxima Atualização/Retificação sobrescreve o
  mesmo registro.
- Os registros vencidos são apagados pela própria função a cada listagem
  ou gravação.
- **Atenção:** o histórico não tem login. Quem tiver a URL do site
  consegue ver e alterar os anúncios das últimas 48h. A tabela tem RLS sem
  policies (a anon key não lê nada direto), mas o acesso pela função é
  aberto. Trave o CORS (seção 6) e considere autenticação.

## Instalar como aplicativo (PWA)

O site pode ser instalado como aplicativo: abre em janela própria (sem
abas nem barra de endereço), ganha ícone na barra de tarefas/menu Iniciar
e dois atalhos no menu do ícone: **Novo anúncio** e **Histórico**.

- **Windows (Chrome ou Edge):** abra o site e clique em **Instalar** no
  topo da página (ou no ícone de instalar na barra de endereço). Depois,
  clique direito no ícone do app → **Fixar na barra de tarefas**. O clique
  direito no ícone mostra os atalhos.
- **Android (Chrome):** menu ⋮ → **Instalar app**. Pressione e segure o
  ícone para ver os atalhos.
- **iPhone (Safari):** Compartilhar → **Adicionar à Tela de Início**. O iOS
  não tem os atalhos do ícone.

Com o app já aberto, um atalho reaproveita a mesma janela: **Histórico**
abre o histórico sem apagar a conversa, e **Novo anúncio** pede
confirmação se houver uma ocorrência na tela. Os atalhos são só
`./?acao=novo` e `./?acao=historico`, então também servem como link.

`sw.js` guarda os arquivos do site para abrir rápido. O `index.html` é
sempre buscado na rede primeiro, então as atualizações entram sozinhas.
Ao trocar um ícone ou imagem, suba a versão de `CACHE` em `sw.js`. A
Edge Function nunca passa pelo cache.

## Estrutura do projeto

```
.
├── index.html                              # front-end (chat + regras de exibição)
├── manifest.webmanifest                    # app instalável: nome, ícones, atalhos
├── sw.js                                   # service worker (cache dos arquivos do site)
├── assets/
│   ├── icons/                              # ícones do app, gerados de logo_cobom.png
│   ├── logo_cobom.png                      # logo do COBOM em alta resolução
│   ├── logo_cobom-128.png                  # logo do cabeçalho
│   ├── luiz-eduardo.png                    # foto usada no painel de homenagem
│   └── favicon-cbmmg.png                   # brasão do CBMMG, usado como favicon
└── supabase/
    ├── migrations/
    │   └── 20260924120000_anuncios.sql     # tabela do histórico de 48h
    └── functions/
        └── gerar-anuncio/
            └── index.ts                    # Edge Function — chama a Groq com a chave protegida
```

## Testando localmente antes de publicar

Crie `supabase/.env.local` (não versionar — já está no `.gitignore`)
com:

```
GROQ_API_KEY=sua-chave-aqui
```

Suba a função num container Deno (só precisa do Docker — não precisa
do `supabase start`, que baixa a stack inteira do Supabase):

```bash
docker run -d --name cobom-fn -p 54331:8000 --env-file supabase/.env.local -v "${PWD}/supabase/functions:/fn" denoland/deno:latest run --allow-net --allow-env /fn/gerar-anuncio/index.ts
```

Depois de editar o `index.ts`, rode `docker restart cobom-fn` (o `--watch`
do Deno não funciona aqui: o Docker no Windows não repassa ao container
os eventos de alteração de arquivo). Logs:
`docker logs -f cobom-fn`. Depois de alterar o `.env.local`, recrie o
container (`docker rm -f cobom-fn` e rode o comando de novo).

Para o histórico funcionar localmente, acrescente ao `.env.local` a URL e
a service role key do projeto (painel do Supabase → Project Settings →
API) e recrie o container:

```
SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
```

Sem elas, a geração funciona normalmente. O Histórico só mostra
"indisponível", e o anúncio aparece com a marca "não salvo no histórico".

Sirva o `index.html` em `localhost` (ex.: XAMPP em
`http://localhost/cobom/`). Quando aberto em `localhost`/`127.0.0.1`, o
front-end usa sozinho a função local (`http://localhost:54331/...`);
em qualquer outro domínio, usa a de produção. Não precisa editar
`EDGE_FUNCTION_URL`.

## O que ainda não tem (próximos passos possíveis)

- **Anexar foto/PDF de novo**: trocar `openai/gpt-oss-120b` por um
  modelo da Groq com visão (ex.: linhagem Llama 4 Scout/Maverick,
  conferir nome atual em console.groq.com/docs/models) e reativar o
  botão de anexo, que já está implementado no front-end (só
  desabilitado).
- **Ditado por voz**: já funciona (usa a função do navegador, sem
  custo e sem depender do provedor de IA).
- **Autenticação**: qualquer pessoa com a URL do site consegue gerar
  anúncios e ver ou alterar o histórico de 48h. Para restringir ao
  pessoal do COBOM, dá pra usar o Supabase Auth ou um código de acesso
  guardado como secret na função.
- **Streaming da resposta**: a versão atual espera a resposta
  completa antes de mostrar.
