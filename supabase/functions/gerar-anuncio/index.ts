// Supabase Edge Function: gerar-anuncio
// Recebe o histórico da conversa (turns) e chama a API do Gemini (Google)
// para gerar o Anúncio de Ocorrência de Destaque, mantendo a chave de API
// (GEMINI_API_KEY) só no servidor — nunca no navegador.
//
// ATENÇÃO — decisão institucional já tomada, registrada aqui para quem
// mantiver este código no futuro: no nível GRATUITO da API do Gemini, o
// Google pode usar os prompts e respostas para melhorar seus produtos
// (ver https://ai.google.dev/gemini-api/terms). Isso só deixa de valer no
// nível pago, com faturamento ativado. Optou-se por seguir mesmo assim
// por restrição orçamentária — ciente do trade-off frente ao item 8.1/8.2
// do Memorando nº 3.200 (proteção de dados de envolvidos).
//
// Deploy:
//   supabase functions deploy gerar-anuncio --project-ref SEU_PROJECT_REF
//   supabase secrets set GEMINI_API_KEY=SUA_CHAVE --project-ref SEU_PROJECT_REF
//
// Teste local:
//   supabase functions serve gerar-anuncio --env-file supabase/.env.local

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
Identifique o(s) critério(s) 3.x aplicável(is), só com base no que foi informado — nunca invente. Isso alimenta o campo ENQUADRAMENTO do anúncio (é sempre o último campo, sempre presente):
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

TÍTULO: se algum critério do item 3 se aplicar (mesmo "a confirmar") → OCORRÊNCIA DE DESTAQUE. Se nenhum se aplicar → OCORRÊNCIA DE RELEVÂNCIA (mesmo modelo, mesmos campos, só o título muda). Atualização: acrescente " — ATUALIZAÇÃO" ao título (mantenha o que segue válido, substitua o alterado, reavalie o enquadramento). Retificação: acrescente " — RETIFICAÇÃO" e corrija só o que estava errado, mantendo o resto do último anúncio desta conversa.

Exemplo de formatação (só o formato, não copie o conteúdo):
*OCORRÊNCIA DE DESTAQUE*
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
Vítimas: número total e, se houver, a situação (ex.: "04 — sendo 02 encarceradas e 02 conscientes e orientadas"; "02 — sendo 01 óbito e 01 ferida, conduzida para unidade hospitalar"). Nunca presuma "sem informação" = zero; só escreva 0 com informação expressa de que não há vítimas. Viaturas/efetivo: quantidade de viaturas (prefixo se informado) e de militares (ex.: "02 viaturas (UR-XXXX e ABTS-XXXX) / 06 militares"). Em andamento: responda SIM ou NÃO; não deduza só porque a guarnição está em deslocamento. Qualquer um desses sem informação suficiente: NÃO INFORMADO — NECESSÁRIO PREENCHIMENTO.

# PRIVACIDADE (item 8.1/8.2 do Memorando)
Em ocorrências envolvendo militar do CBMMG, autoridade civil/militar, pessoa pública ou militar de outra instituição com suposto ilícito penal/administrativo: não cite nomes de suspeitos, investigados, testemunhas ou envolvidos na síntese (use "o condutor", "o militar envolvido", "a vítima" etc.) e, depois do anúncio e de eventuais pendências, acrescente a linha *OBSERVAÇÃO DE PRIVACIDADE:* "Ocorrência com possível ilícito penal/administrativo — nos termos do item 8.1 do Memorando nº 3.200, não divulgar nomes de envolvidos; comunicar o fato ao chefe direto/comandante do militar envolvido, se aplicável." Em acidente com militar do CBMMG, esclareça se foi em serviço ou não, quando souber. Sem suspeita de ilícito, não inclua essa linha.

# FORMATO FINAL
Responda SOMENTE com o bloco do anúncio, pronto para colar no Telegram — sem cabeçalhos, sem título de seção, sem comentário em volta (isso vale mesmo com ENQUADRAMENTO "a confirmar", que fica dentro do próprio campo). Acrescente PENDÊNCIAS DE PREENCHIMENTO só se houver campo faltante, e OBSERVAÇÃO DE PRIVACIDADE só se aplicável — nessa ordem, depois do anúncio. Nunca invente informação para completar o modelo; nunca omita um campo obrigatório; sempre reavalie o enquadramento a cada mensagem, inclusive em atualizações.`;

const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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
  mimeType: string; // image/jpeg, image/png, image/webp, image/gif, application/pdf
  data: string; // base64, sem o prefixo "data:...;base64,"
}

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // ~15MB decodificado, por arquivo

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let turns: Turn[];
  let attachments: Attachment[];
  try {
    const body = await req.json();
    turns = body.turns;
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
      // base64 length ~ 4/3 dos bytes originais
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

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Gemini usa "user"/"model" (não "assistant") e cada turno é
  // {role, parts:[...]}. Anexos (foto/PDF) só valem para a ÚLTIMA
  // mensagem do usuário — igual ao comportamento da versão claude.ai,
  // que também não reenvia anexos de turnos antigos.
  const contents = turns.map((t, i) => {
    // deno-lint-ignore no-explicit-any
    const parts: any[] = [{ text: t.content }];
    const isLastUserTurn = i === turns.length - 1 && t.role === "user";
    if (isLastUserTurn) {
      for (const a of attachments) {
        parts.push({ inline_data: { mime_type: a.mimeType, data: a.data } });
      }
    }
    return {
      role: t.role === "assistant" ? "model" : "user",
      parts,
    };
  });

  const requestBody = JSON.stringify({
    system_instruction: { parts: [{ text: RULES }] },
    contents,
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: 0.4,
      thinkingConfig: { thinkingLevel: "low" },
    },
  });

  try {
    // O Gemini às vezes responde 503 "high demand" em picos de uso —
    // é temporário do lado do Google, então tentamos de novo sozinhos
    // (com uma pequena espera) antes de desistir e mostrar erro.
    const MAX_ATTEMPTS = 3;
    let geminiRes: Response | null = null;
    let lastErrText = "";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });

      if (geminiRes.ok) break;

      lastErrText = await geminiRes.text();
      const retryable = geminiRes.status === 503 || geminiRes.status === 429;
      console.error(
        `Gemini API error (tentativa ${attempt}/${MAX_ATTEMPTS}):`,
        geminiRes.status,
        lastErrText,
      );

      if (!retryable || attempt === MAX_ATTEMPTS) break;
      await new Promise((r) => setTimeout(r, attempt * 800)); // 800ms, depois 1600ms
    }

    if (!geminiRes || !geminiRes.ok) {
      const status = geminiRes?.status;
      const code = status === 503 || status === 429 ? "model_overloaded" : "upstream_error";
      return new Response(
        JSON.stringify({ error: code, status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await geminiRes.json();
    const candidate = (data.candidates || [])[0];
    const text = (candidate?.content?.parts || [])
      .map((p: { text?: string }) => p.text || "")
      .join("");

    if (!text) {
      // finishReason "SAFETY" ou similar cai aqui também — sem texto utilizável.
      console.error("Resposta vazia do Gemini:", JSON.stringify(data));
      return new Response(JSON.stringify({ error: "empty_completion" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Edge function error:", e);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
