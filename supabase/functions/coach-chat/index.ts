// ── Coach Chat Edge Function ──────────────────────────────────────
// Supabase Edge Function that proxies messages to Claude Haiku.
// Handles: JWT auth, rate limiting, conversation history, SSE streaming.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const ALLOWED_ORIGINS = [
  "https://runplanner-alpha.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const SYSTEM_PROMPT = `Tu es le coach IA de RunPlanner, une application de planification d'entraînement course à pied.

Règles :
- Tu tutoies l'utilisateur. Tu es bienveillant, technique et encourageant.
- Tu donnes des conseils d'entraînement basés sur le contexte fourni (profil, plan, allures).
- Tu connais la méthodologie Jack Daniels (VDOT, zones d'allure) et la périodisation (Base, Construction, Spécifique, Affûtage).
- Tu peux expliquer pourquoi une séance ou phase est programmée ainsi.
- Tu NE modifies JAMAIS le plan. Tu conseilles uniquement.
- Tu NE donnes JAMAIS de conseils médicaux. Si l'utilisateur mentionne une blessure ou douleur, recommande-lui de consulter un médecin du sport ou un kinésithérapeute.
- Tu réponds en français uniquement.
- Tes réponses sont concises : 2-4 paragraphes maximum. Pas de pavés.
- Si tu ne sais pas quelque chose, dis-le honnêtement.`;

Deno.serve(async (req: Request) => {
  const CORS = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  try {
    // ── 1. Authenticate user via JWT ──
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Token invalide" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── 2. Parse request body ──
    const { message, coachContext } = await req.json();
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Message vide" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const trimmedMessage = message.trim().slice(0, 2000);

    // ── 3. Check rate limits ──
    const { data: rateData, error: rateError } = await supabaseAdmin
      .rpc("check_chat_rate_limit", { p_user_id: user.id });

    if (rateError) {
      console.error("Rate limit check error:", rateError);
    }

    if (!rateData?.allowed) {
      const reason = rateData?.user_count >= 10
        ? "Tu as atteint ta limite de 10 messages par jour. Reviens demain !"
        : "Le coach est très sollicité aujourd'hui. Réessaie plus tard.";
      return new Response(JSON.stringify({ error: reason, rate_limited: true }), {
        status: 429,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── 4. Save user message to DB ──
    await supabaseAdmin.from("chat_messages").insert({
      user_id: user.id,
      role: "user",
      content: trimmedMessage,
    });

    // ── 5. Load conversation history (last 20 messages) ──
    const { data: historyData } = await supabaseAdmin
      .from("chat_messages")
      .select("role, content")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    // Reverse to chronological order
    const conversationMessages = (historyData || []).reverse();

    // ── 6. Build system prompt with context ──
    const fullSystemPrompt = coachContext
      ? `${SYSTEM_PROMPT}\n\n--- Contexte de l'athlète ---\n${coachContext}`
      : SYSTEM_PROMPT;

    // ── 7. Call Claude Haiku API with streaming ──
    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-20250414",
        max_tokens: 1024,
        system: fullSystemPrompt,
        messages: conversationMessages.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
        stream: true,
      }),
    });

    if (!anthropicResponse.ok) {
      const errBody = await anthropicResponse.text();
      console.error("Anthropic API error:", anthropicResponse.status, errBody);
      return new Response(JSON.stringify({ error: "Le coach est momentanément indisponible. Réessaie." }), {
        status: 502,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── 8. Stream response back to client via SSE ──
    let fullResponse = "";

    const stream = new ReadableStream({
      async start(controller) {
        const reader = anthropicResponse.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") continue;

                try {
                  const parsed = JSON.parse(data);
                  if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                    fullResponse += parsed.delta.text;
                    controller.enqueue(
                      new TextEncoder().encode(`data: ${JSON.stringify({ text: parsed.delta.text })}\n\n`)
                    );
                  }
                  if (parsed.type === "message_stop") {
                    controller.enqueue(
                      new TextEncoder().encode(`data: [DONE]\n\n`)
                    );
                  }
                } catch {
                  // Skip malformed JSON
                }
              }
            }
          }

          // Final DONE signal
          controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));
          controller.close();

          // ── 9. Save assistant response to DB ──
          if (fullResponse.trim()) {
            await supabaseAdmin.from("chat_messages").insert({
              user_id: user.id,
              role: "assistant",
              content: fullResponse.trim(),
            });
          }
        } catch (err) {
          console.error("Stream error:", err);
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...CORS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    console.error("Edge function error:", err);
    const CORS = getCorsHeaders(req);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
