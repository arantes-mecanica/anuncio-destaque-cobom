// Supabase Edge Function: gerar-anuncio
// Recebe o histórico da conversa (turns) e chama a API da Groq para gerar
// o Anúncio de Ocorrência, mantendo a chave de API (GROQ_API_KEY) só no
// servidor — nunca no navegador.
//
// Também guarda o último texto de cada anúncio na tabela public.anuncios
// (histórico de 48h a partir da data do fato, para atualização/retificação)
// e aplica a deliberação de destaque do CBU. Ações (campo "action" do corpo):
//   (nenhuma)         gera/atualiza o anúncio via Groq e grava no histórico
//   "listar"          anúncios ainda dentro das 48h
//   "marcar_destaque" troca o título Relevância ⇄ Destaque, sem chamar a Groq
//
// Por que Groq em vez de Gemini/Anthropic: sem custo (nível gratuito sem
// cartão), sem uso dos dados para treinamento em nenhum nível (gratuito ou
// pago — diferente do Gemini, cuja proteção só vale no pago), e limite de
// requisições bem mais folgado (compatível com o volume do COBOM).
// Ver https://groq.com/privacy-policy
//
// Deploy:
//   supabase functions deploy gerar-anuncio --project-ref SEU_PROJECT_REF
//   supabase secrets set GROQ_API_KEY=SUA_CHAVE --project-ref SEU_PROJECT_REF
//
// Teste local:
//   supabase functions serve gerar-anuncio --env-file supabase/.env.local

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const RULES = `Você é um assistente do CBMMG especializado em triagem e elaboração de Anúncios de Ocorrência de Destaque, com base no item 3 do Memorando nº 3.200 - CBMMG/BM3 (17/08/2026, SEI 1400.01.0050313/2026-06, que revogou o Memorando nº 3.192). Receba a descrição da ocorrência, identifique o enquadramento e produza o anúncio no modelo abaixo.

# CRITÉRIOS DE DESTAQUE (item 3 do Memorando)
3.1. Acidente aeronáutico, ferroviário ou aquaviário.
3.2. Incêndio urbano multiagência que comprometa edificação de grande relevância (conjunto arquitetônico, aglomerado, universidade, shopping, aeroporto, terminal, estádio, templo, prédio público, hospital, unidade de saúde, rede de supermercados/bancos/lojas etc.) e/ou gere evacuação de grande público.
3.3. Incêndio urbano ou florestal com vítima atendida e/ou conduzida a unidade de saúde.
3.4. Incêndio em ônibus com indícios de crime.
3.5. Incêndio em edificação histórica.
3.6. Interdição/Embargo total em evento temporário ou edificação.
3.7. Produtos perigosos com: 3.7.1 vítima atendida/conduzida a saúde; 3.7.2 risco de dano ambiental; 3.7.3 fechamento de rodovia; 3.7.4 risco de explosão, intoxicação ou outro risco à vida.
3.8. Independentemente de classificação: 3.8.1 exige SCO; 3.8.2 resgate/recuperação de vítima acima de 3h de trabalho.
3.9. Envolve: 3.9.1 autoridade civil (deputado, vereador, senador, ministro, juiz, procurador, secretário, prefeito, governador, presidente etc.); 3.9.2 autoridade militar (oficial superior); 3.9.3 pessoa pública (artista, esportista, jornalista, digital influencer relevante); 3.9.4 turista estrangeiro com agravo à saúde; 3.9.5 militar do CBMMG em serviço; 3.9.6 militar do CBMMG (ativa/reserva) com agravo à saúde ou óbito; 3.9.7 militar de outra instituição em serviço; 3.9.8 múltiplas vítimas em óbito/hospitalizadas acima da capacidade local.
3.10. Potencial de repercussão estratégica, política, institucional ou midiática (alta demanda de imprensa ou grande circulação nas redes).
3.11. Inundação, enxurrada ou alagamento com vítima em óbito.
3.12. Risco para edificação/área que exija evacuação.
3.13. Colapso de edificação ou rompimento de barragem.
3.14. Comprometimento de serviço essencial (água, luz, esgoto etc.) que afete a habitabilidade da população.

# ENQUADRAMENTO
Identifique o(s) critério(s) 3.x aplicável(is), só com base no que foi informado — nunca invente. Isso alimenta o campo ENQUADRAMENTO do anúncio (é sempre o último campo, sempre presente), que é o assessoramento do COBOM ao CBU para a deliberação do destaque:
- confirmado: "Item 3.x – [resumo do critério]" (mais de um item: "Itens 3.x e 3.y – ...");
- incerto: "A confirmar – possível item 3.x ([critério]); [o que falta para confirmar]";
- nenhum critério aplicável: "Nenhum critério do Memorando nº 3.200 identificado com as informações disponíveis."

# MODELO DO ANÚNCIO (formato Telegram)
É a mensagem real enviada ao grupo de autoridades (item 5.2 do Memorando). Use negrito de asterisco simples (*texto*, nunca **texto**), cada campo em uma única linha (rótulo em negrito + dois-pontos + espaço + valor, sem quebrar linha entre eles). Campos obrigatórios, exatamente nesta ordem:

*[TÍTULO]*
*SÍNTESE DO FATO:* [ver regras abaixo]
*DATA/HORA DO INÍCIO DA OCORRÊNCIA:* [ex.: 13/09/2026 – 19h50min]
*LOCAL:* [logradouro, número, bairro, município]
*QUANTIDADE DE VÍTIMAS:* [quantidade e situação, quando relevante]
*QUANTIDADE DE VIATURA E EFETIVO EMPREGADO:* [viaturas, prefixo se houver, e militares]
*OCORRÊNCIA EM ANDAMENTO?:* [SIM ou NÃO]
*ENQUADRAMENTO:* [ver seção ENQUADRAMENTO]

TÍTULO: quem decide entre OCORRÊNCIA DE DESTAQUE e OCORRÊNCIA DE RELEVÂNCIA é o CBU (Coordenador de Bombeiros da Unidade), não a análise dos critérios — o COBOM só assessora o CBU pelo campo ENQUADRAMENTO. Use exatamente o título indicado na seção "TÍTULO DESTE ANÚNCIO", no fim destas instruções, mesmo que algum critério do item 3 se aplique (mesmo modelo, mesmos campos, só o título muda). Atualização: acrescente " — ATUALIZAÇÃO" ao título (mantenha o que segue válido, substitua o alterado, reavalie o enquadramento). Retificação: acrescente " — RETIFICAÇÃO" e corrija só o que estava errado, mantendo o resto do último anúncio desta conversa (que pode ter sido recuperado do histórico).

Exemplo de formatação (só o formato, não copie o conteúdo):
*OCORRÊNCIA DE RELEVÂNCIA*
*SÍNTESE DO FATO:* Segundo solicitação, incêndio em residência unifamiliar iniciado em colchão de quarto. GU BM confirmou uma vítima consciente e orientada, com queimadura de 2º grau em membro superior, encaminhada à UPA local pela USB do SAMU. GUBM combateu as chamas e avaliou a estrutura do imóvel.
*DATA/HORA DO INÍCIO DA OCORRÊNCIA:* 13/09/2026 – 19h50min.
*LOCAL:* Alameda Cajueiros nº 54, Serra Verde - Pará de Minas.
*QUANTIDADE DE VÍTIMAS:* 01 vítima.
*QUANTIDADE DE VIATURA E EFETIVO EMPREGADO:* 01 viatura (ABTS 1392) e 03 militares.
*OCORRÊNCIA EM ANDAMENTO?:* Não.
*ENQUADRAMENTO:* Item 3.3 – incêndio urbano com vítima atendida e/ou conduzida a unidade de saúde.

# CAMPOS OBRIGATÓRIOS E PENDÊNCIAS
Os sete campos são obrigatórios. Sem informação suficiente, NÃO invente — use NÃO INFORMADO — NECESSÁRIO PREENCHIMENTO (ENQUADRAMENTO segue sua própria regra, nunca fica "não informado"). Se algum dos seis primeiros campos ficar pendente, acrescente depois do anúncio uma seção *PENDÊNCIAS DE PREENCHIMENTO:* com cada campo faltante em uma linha, precedido de hífen. Se todos estiverem preenchidos, omita essa seção por completo (nunca escreva "nenhuma").

# SÍNTESE DO FATO
Objetiva, técnica, institucional; sem opiniões, sem sensacionalismo, sem atribuir causa/responsabilidade/autoria sem confirmação; nunca inventar. Quando a informação permitir, siga esta cadeia (pule o elo sem informação, sem inventar): 1) relato inicial ("Segundo solicitação..."/"Segundo informações preliminares..."); 2) confirmação da GU BM no local; 3) vítimas — idade, sexo, lesão, consciência, sinais vitais quando relevante; 4) encaminhamento — unidade de destino e serviço/viatura de transporte (SAMU, USB etc.); 5) ação do CBMMG — combate a chamas, avaliação estrutural, isolamento, resgate, atendimento pré-hospitalar. A síntese deve deixar claro o quê, onde, consequências e por que é relevante. Informação ainda não confirmada pela GU BM: deixe isso explícito ("segundo informações preliminares", "ainda não confirmado pela Guarnição BM") — nunca vire fato confirmado.

# VÍTIMAS, VIATURAS E SITUAÇÃO
Vítimas: número total e, se houver, a situação (ex.: "04 — sendo 02 encarceradas e 02 conscientes e orientadas"; "02 — sendo 01 óbito e 01 ferida, conduzida para unidade hospitalar"). Nunca presuma "sem informação" = zero; só escreva 0 com informação expressa de que não há vítimas. Viaturas/efetivo: quantidade de viaturas (prefixo se informado) e de militares (ex.: "02 viaturas (UR-XXXX e ABTS-XXXX) / 06 militares"). Conte SOMENTE viaturas e militares do CBMMG. Relatórios de chamada (SISP) também listam recursos de outros órgãos acionados em apoio — Polícia Militar (ex.: prefixos MP), Polícia Civil/perícia, SAMU, Defesa Civil, concessionárias etc. —, que NÃO entram nesse campo, nem na contagem de viaturas, nem na de efetivo. Se não for possível separar com segurança o efetivo do CBMMG, conte só o que for certamente do CBMMG e registre a dúvida em PENDÊNCIAS DE PREENCHIMENTO. Em andamento: responda SIM ou NÃO; não deduza só porque a guarnição está em deslocamento. Qualquer um desses sem informação suficiente: NÃO INFORMADO — NECESSÁRIO PREENCHIMENTO.

# PRIVACIDADE (item 8.1/8.2 do Memorando)
Em ocorrências envolvendo militar do CBMMG, autoridade civil/militar, pessoa pública ou militar de outra instituição com suposto ilícito penal/administrativo: não cite nomes de suspeitos, investigados, testemunhas ou envolvidos na síntese (use "o condutor", "o militar envolvido", "a vítima" etc.) e, depois do anúncio e de eventuais pendências, acrescente a linha *OBSERVAÇÃO DE PRIVACIDADE:* "Ocorrência com possível ilícito penal/administrativo — nos termos do item 8.1 do Memorando nº 3.200, não divulgar nomes de envolvidos; comunicar o fato ao chefe direto/comandante do militar envolvido, se aplicável." Em acidente com militar do CBMMG, esclareça se foi em serviço ou não, quando souber. Sem suspeita de ilícito, não inclua essa linha.

# FORMATO FINAL
Responda SOMENTE com o bloco do anúncio, pronto para colar no Telegram — sem cabeçalhos, sem título de seção, sem comentário em volta (isso vale mesmo com ENQUADRAMENTO "a confirmar", que fica dentro do próprio campo). Acrescente PENDÊNCIAS DE PREENCHIMENTO só se houver campo faltante, e OBSERVAÇÃO DE PRIVACIDADE só se aplicável — nessa ordem, depois do anúncio. Nunca invente informação para completar o modelo; nunca omita um campo obrigatório; sempre reavalie o enquadramento a cada mensagem, inclusive em atualizações.`;

const GROQ_MODEL_TEXT = "openai/gpt-oss-120b";
const GROQ_MODEL_VISION = "qwen/qwen3.8-27b"; // lê texto + imagem (até 3 por requisição)
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Ajuste para o(s) domínio(s) reais do seu front-end assim que estiver no ar
// (ex.: "https://seu-usuario.github.io"). "*" funciona para testar, mas é
// menos seguro em produção.
const ALLOWED_ORIGIN = "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Turn {
  role: "user" | "assistant";
  content: string;
}

interface Attachment {
  mimeType: string; // image/jpeg, image/png, image/webp ou image/gif — nunca PDF (o
  // front-end já extrai texto ou converte páginas em imagem antes de mandar aqui).
  data: string; // base64, sem o prefixo "data:...;base64,"
}

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_ATTACHMENTS = 3; // limite do modelo de visão da Groq (qwen/qwen3.8-27b)
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------- Histórico (tabela public.anuncios) ----------

// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm injetadas no Supabase
// hospedado. No container local, sem elas, a geração segue funcionando e só
// o histórico fica indisponível.
function dbClient(): SupabaseClient | null {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ANUNCIO_COLS = "id, destaque_cbu, data_fato, created_at, updated_at, expira_em";

// Linha de título do anúncio, ex.: "*OCORRÊNCIA DE RELEVÂNCIA — ATUALIZAÇÃO*".
// Aceita o sufixo também fora dos asteriscos ("*OCORRÊNCIA DE DESTAQUE* — ATUALIZAÇÃO"),
// que o modelo às vezes produz; aplicarTitulo normaliza para dentro.
const TITULO_RE =
  /^[ \t]*\*{0,2}[ \t]*OCORR[ÊE]NCIA DE (?:DESTAQUE|RELEV[ÂA]NCIA)[ \t]*\*{0,2}([^*\n]*?)[ \t]*\*{0,2}[ \t]*$/m;

// Garante o título decidido pelo CBU (o modelo pode errar). manterSufixo=false
// descarta " — ATUALIZAÇÃO"/" — RETIFICAÇÃO": usado ao marcar/desmarcar
// destaque, que é o primeiro disparo daquele anúncio com o novo título.
function aplicarTitulo(texto: string, destaque: boolean, manterSufixo: boolean): string {
  const palavra = destaque ? "DESTAQUE" : "RELEVÂNCIA";
  const m = texto.match(TITULO_RE);
  if (!m) return `*OCORRÊNCIA DE ${palavra}*\n` + texto;
  const sufixo = manterSufixo && m[1].trim() ? " " + m[1].trim() : "";
  return texto.replace(TITULO_RE, `*OCORRÊNCIA DE ${palavra}${sufixo}*`);
}

// Lê "DATA/HORA DO INÍCIO DA OCORRÊNCIA: 13/09/2026 – 19h50min" (horário de
// Brasília). Ausente, inválida ou no futuro → null (a retenção passa a contar
// da criação do registro).
function extrairDataFato(texto: string): string | null {
  const m = texto.match(
    /DATA\/HORA DO IN[ÍI]CIO DA OCORR[ÊE]NCIA:\*?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s*[–—-]?\s*(\d{1,2})\s*[h:]\s*(\d{2})?)?/i,
  );
  if (!m) return null;
  const [d, mo, y, h, mi] = [m[1], m[2], m[3], m[4] ?? "0", m[5] ?? "0"].map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  const dt = new Date(`${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}:00-03:00`);
  if (isNaN(dt.getTime()) || dt.getTime() > Date.now() + 60 * 60 * 1000) return null;
  return dt.toISOString();
}

async function purgarExpirados(db: SupabaseClient) {
  await db.from("anuncios").delete().lt("expira_em", new Date().toISOString());
}

// Grava o texto gerado: atualiza o registro existente ou cria um novo (inclusive
// quando o anterior já expirou). Devolve as colunas do registro gravado.
async function salvarAnuncio(db: SupabaseClient, anuncioId: string | null, texto: string, destaque: boolean) {
  await purgarExpirados(db);
  const row = {
    texto,
    destaque_cbu: destaque,
    data_fato: extrairDataFato(texto),
    updated_at: new Date().toISOString(),
  };
  if (anuncioId) {
    const { data, error } = await db.from("anuncios").update(row).eq("id", anuncioId).select(ANUNCIO_COLS).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  const { data, error } = await db.from("anuncios").insert(row).select(ANUNCIO_COLS).single();
  if (error) throw error;
  return data;
}

async function listarAnuncios(): Promise<Response> {
  const db = dbClient();
  if (!db) return json({ error: "historico_indisponivel" }, 503);
  try {
    await purgarExpirados(db);
    const { data, error } = await db
      .from("anuncios")
      .select("texto, " + ANUNCIO_COLS)
      .gt("expira_em", new Date().toISOString())
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return json({ anuncios: data });
  } catch (e) {
    console.error("Erro ao listar histórico:", e);
    return json({ error: "historico_indisponivel" }, 503);
  }
}

async function marcarDestaque(id: unknown, destaque: unknown): Promise<Response> {
  if (typeof id !== "string" || !UUID_RE.test(id) || typeof destaque !== "boolean") {
    return json({ error: "invalid_request" }, 400);
  }
  const db = dbClient();
  if (!db) return json({ error: "historico_indisponivel" }, 503);
  try {
    const { data: atual, error } = await db
      .from("anuncios")
      .select("texto")
      .eq("id", id)
      .gt("expira_em", new Date().toISOString())
      .maybeSingle();
    if (error) throw error;
    if (!atual) return json({ error: "not_found" }, 404);

    const texto = aplicarTitulo(atual.texto, destaque, false);
    const { data, error: upErr } = await db
      .from("anuncios")
      .update({ texto, destaque_cbu: destaque, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(ANUNCIO_COLS)
      .single();
    if (upErr) throw upErr;
    return json({ text: texto, anuncio: data });
  } catch (e) {
    console.error("Erro ao marcar destaque:", e);
    return json({ error: "historico_indisponivel" }, 503);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch (_e) {
    return json({ error: "invalid_request" }, 400);
  }

  if (body?.action === "listar") return listarAnuncios();
  if (body?.action === "marcar_destaque") return marcarDestaque(body.id, body.destaque);

  let turns: Turn[];
  let attachments: Attachment[];
  let anuncioId: string | null;
  let destaqueCbu: boolean;
  try {
    turns = body.turns;
    anuncioId = body.anuncioId ?? null;
    destaqueCbu = body.destaqueCbu === true;
    if (anuncioId !== null && (typeof anuncioId !== "string" || !UUID_RE.test(anuncioId))) {
      throw new Error("bad_anuncio_id");
    }
    attachments = Array.isArray(body.attachments) ? body.attachments : [];
    if (!Array.isArray(turns) || turns.length === 0) {
      throw new Error("empty");
    }
    if (turns[turns.length - 1].role !== "user") {
      throw new Error("must_end_on_user");
    }
    if (attachments.length > MAX_ATTACHMENTS) {
      throw new Error("too_many_attachments");
    }
    for (const a of attachments) {
      if (!a || typeof a.data !== "string" || !ALLOWED_MIME.has(a.mimeType)) {
        throw new Error("bad_attachment");
      }
      if (a.data.length > (MAX_ATTACHMENT_BYTES * 4) / 3) {
        throw new Error("attachment_too_large");
      }
    }
  } catch (_e) {
    return new Response(JSON.stringify({ error: "invalid_request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Formato OpenAI-padrão: role "system" para as regras. Anexos (imagem)
  // só valem para a ÚLTIMA mensagem do usuário — mesmo comportamento das
  // versões anteriores, que também não reenviam anexos de turnos antigos.
  const messages = [
    {
      role: "system",
      content: RULES + "\n\n# TÍTULO DESTE ANÚNCIO\n" + (destaqueCbu
        ? "*OCORRÊNCIA DE DESTAQUE* — o CBU deliberou destaque."
        : "*OCORRÊNCIA DE RELEVÂNCIA* — o CBU ainda não deliberou destaque."),
    },
    ...turns.map((t, i) => {
      const isLastUserTurn = i === turns.length - 1 && t.role === "user";
      if (isLastUserTurn && attachments.length > 0) {
        // deno-lint-ignore no-explicit-any
        const content: any[] = [{ type: "text", text: t.content }];
        for (const a of attachments) {
          content.push({ type: "image_url", image_url: { url: `data:${a.mimeType};base64,${a.data}` } });
        }
        return { role: t.role, content };
      }
      return { role: t.role, content: t.content };
    }),
  ];

  const model = attachments.length > 0 ? GROQ_MODEL_VISION : GROQ_MODEL_TEXT;

  const requestBody = JSON.stringify({
    model,
    messages,
    max_tokens: 2048,
    temperature: 0.4,
  });

  try {
    // Repetimos automaticamente em caso de sobrecarga temporária (503) ou
    // limite de requisições (429), antes de desistir e mostrar erro.
    const MAX_ATTEMPTS = 3;
    let groqRes: Response | null = null;
    let lastErrText = "";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      groqRes = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: requestBody,
      });

      if (groqRes.ok) break;

      lastErrText = await groqRes.text();
      const retryable = groqRes.status === 503 || groqRes.status === 429;
      console.error(
        `Groq API error (tentativa ${attempt}/${MAX_ATTEMPTS}):`,
        groqRes.status,
        lastErrText,
      );

      if (!retryable || attempt === MAX_ATTEMPTS) break;
      await new Promise((r) => setTimeout(r, attempt * 800)); // 800ms, depois 1600ms
    }

    if (!groqRes || !groqRes.ok) {
      const status = groqRes?.status;
      const code = status === 503 || status === 429 ? "model_overloaded" : "upstream_error";
      return new Response(
        JSON.stringify({ error: code, status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await groqRes.json();
    const rawText = data.choices?.[0]?.message?.content || "";

    if (!rawText) {
      console.error("Resposta vazia da Groq:", JSON.stringify(data));
      return new Response(JSON.stringify({ error: "empty_completion" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = aplicarTitulo(rawText, destaqueCbu, true);

    // Falha ao gravar no histórico não derruba o anúncio já gerado: o texto
    // volta normalmente e o front avisa que ele não ficou salvo.
    let anuncio = null;
    const db = dbClient();
    if (db) {
      try {
        anuncio = await salvarAnuncio(db, anuncioId, text, destaqueCbu);
      } catch (e) {
        console.error("Erro ao gravar no histórico:", e);
      }
    }

    return json({ text, anuncio });
  } catch (e) {
    console.error("Edge function error:", e);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
