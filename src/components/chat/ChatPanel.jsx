// ── Chat Panel ────────────────────────────────────────────────────
// Slide-up chat panel with message history, streaming, and input.
// Opens from bottom, overlays main content.

import { useState, useEffect, useRef, useCallback } from 'react';
import { FONT, colors } from '../../styles/tokens';
import { sendMessage, loadHistory, ChatError } from '../../services/chatService';

export default function ChatPanel({ isOpen, onClose, coachContext, accessToken }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  // Load history when panel opens
  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    loadHistory().then((history) => {
      setMessages(history.map((m) => ({
        role: m.role,
        content: m.content,
      })));
      setIsLoading(false);
    });
  }, [isOpen]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens and loaded
  useEffect(() => {
    if (isOpen && !isLoading) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen, isLoading]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setError(null);
    setInput("");

    // Add user message to UI
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    // Add placeholder for assistant streaming
    setMessages((prev) => [...prev, { role: "assistant", content: "", isStreaming: true }]);
    setIsStreaming(true);

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      await sendMessage(
        text,
        coachContext,
        accessToken,
        (chunk) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.isStreaming) {
              updated[updated.length - 1] = { ...last, content: last.content + chunk };
            }
            return updated;
          });
        },
        abortController.signal
      );

      // Mark streaming complete
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.isStreaming) {
          updated[updated.length - 1] = { ...last, isStreaming: false };
        }
        return updated;
      });
    } catch (err) {
      // Remove the empty streaming placeholder
      setMessages((prev) => prev.filter((m) => !m.isStreaming));

      if (err instanceof ChatError) {
        setError(err.message);
      } else if (err.name !== "AbortError") {
        setError("Connexion interrompue. Réessaie.");
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, coachContext, accessToken]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 0, left: 0, right: 0, top: 0,
      zIndex: 60,
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-end",
    }}>
      {/* Backdrop */}
      <div
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)" }}
        onClick={onClose}
      />

      {/* Panel */}
      <div style={{
        position: "relative",
        width: "100%",
        maxWidth: 480,
        margin: "0 auto",
        height: "75vh",
        background: colors.background,
        borderTop: `2px solid ${colors.primary}`,
        borderRadius: "8px 8px 0 0",
        display: "flex",
        flexDirection: "column",
        fontFamily: FONT,
        overflow: "hidden",
        animation: "slideUp 0.2s ease-out",
      }}>
        {/* Header */}
        <div style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${colors.separator || "#eee"}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Coach IA</div>
            <div style={{ fontSize: 10, color: colors.muted }}>
              Pose-moi une question sur ton plan
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              fontFamily: FONT, fontSize: 18,
              background: "none", border: "none",
              cursor: "pointer", color: colors.muted,
              padding: "4px 8px", lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}>
          {isLoading ? (
            <div style={{ textAlign: "center", color: colors.muted, fontSize: 12, marginTop: 20 }}>
              Chargement...
            </div>
          ) : messages.length === 0 ? (
            <div style={{
              textAlign: "center", color: colors.muted,
              fontSize: 12, marginTop: 20, lineHeight: 1.6,
            }}>
              Salut ! Je suis ton coach IA. 🏃
              <br />Pose-moi une question sur ton entraînement.
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                }}
              >
                <div style={{
                  padding: "8px 12px",
                  borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                  background: msg.role === "user" ? colors.primary : colors.surface,
                  color: msg.role === "user" ? colors.white : colors.primary,
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}>
                  {msg.content}
                  {msg.isStreaming && (
                    <span style={{
                      display: "inline-block",
                      width: 6, height: 14,
                      background: colors.muted,
                      marginLeft: 2,
                      animation: "blink 0.8s infinite",
                      verticalAlign: "text-bottom",
                    }} />
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Error display */}
        {error && (
          <div style={{
            padding: "8px 16px",
            fontSize: 12,
            color: colors.error,
            background: "#fff0f0",
            borderTop: `1px solid ${colors.separator || "#eee"}`,
          }}>
            {error}
          </div>
        )}

        {/* Input bar */}
        <div style={{
          padding: "10px 12px",
          borderTop: `1px solid ${colors.separator || "#eee"}`,
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
          flexShrink: 0,
          background: colors.background,
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Écris ton message..."
            rows={1}
            disabled={isStreaming}
            style={{
              fontFamily: FONT, fontSize: 13,
              border: `1px solid ${colors.border}`,
              borderRadius: 4,
              padding: "8px 10px",
              flex: 1,
              resize: "none",
              outline: "none",
              background: colors.white,
              maxHeight: 80,
              lineHeight: 1.4,
            }}
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            style={{
              fontFamily: FONT, fontSize: 12, fontWeight: 700,
              padding: "8px 14px",
              background: isStreaming || !input.trim() ? colors.surface : colors.primary,
              color: isStreaming || !input.trim() ? colors.muted : colors.white,
              border: `2px solid ${isStreaming || !input.trim() ? colors.border : colors.primary}`,
              borderRadius: 4,
              cursor: isStreaming || !input.trim() ? "default" : "pointer",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {isStreaming ? "..." : "→"}
          </button>
        </div>
      </div>
    </div>
  );
}
