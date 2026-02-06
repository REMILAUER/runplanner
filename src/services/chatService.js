// ── Chat Service ──────────────────────────────────────────────────
// Handles communication with the coach-chat Edge Function.
// Supports SSE streaming and message history loading.

import { supabase } from '../lib/supabase';

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach-chat`;

/**
 * Custom error class for chat errors.
 */
export class ChatError extends Error {
  constructor(message, status, rateLimited = false) {
    super(message);
    this.status = status;
    this.rateLimited = rateLimited;
  }
}

/**
 * Send a message to the coach and stream the response.
 * @param {string} message - User's message
 * @param {string} coachContext - Context string from buildCoachContext()
 * @param {string} accessToken - JWT from session.access_token
 * @param {function} onChunk - Called with each text chunk as it arrives
 * @param {AbortSignal} [signal] - Optional abort signal for cancellation
 * @returns {Promise<string>} The complete assistant response
 */
export async function sendMessage(message, coachContext, accessToken, onChunk, signal) {
  const response = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ message, coachContext }),
    signal,
  });

  // Handle non-streaming error responses
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ChatError(
      errorData.error || "Erreur de connexion au coach",
      response.status,
      errorData.rate_limited || false
    );
  }

  // Parse SSE stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullResponse = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed.text) {
            fullResponse += parsed.text;
            onChunk(parsed.text);
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }
  }

  return fullResponse;
}

/**
 * Load message history from Supabase.
 * Uses RLS — automatically filtered by authenticated user.
 * @returns {Promise<Array<{role: string, content: string, created_at: string}>>}
 */
export async function loadHistory() {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("chat_messages")
    .select("role, content, created_at")
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    console.warn("[chatService] Erreur chargement historique:", error.message);
    return [];
  }

  return data || [];
}
