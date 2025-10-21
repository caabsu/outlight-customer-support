"use client";

import { useState } from "react";
import { useConversations } from "@/lib/ConversationContext";

export default function ConversationView() {
  const { selectedConversation, refreshConversations } = useConversations();
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!replyText.trim() || !selectedConversation) return;

    setSending(true);
    try {
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          to: selectedConversation.customer.primaryEmail,
          body: replyText,
        }),
      });
      setReplyText("");
      // Refresh conversations to show the new message
      await refreshConversations();
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setSending(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  if (!selectedConversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Select a conversation</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <h2 className="text-xl font-semibold text-foreground mb-2">
          {selectedConversation.subject}
        </h2>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-medium text-primary">
              {(selectedConversation.customer.name || selectedConversation.customer.primaryEmail)[0].toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {selectedConversation.customer.name || selectedConversation.customer.primaryEmail}
            </p>
            <p className="text-xs text-muted-foreground">
              {selectedConversation.customer.primaryEmail}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {selectedConversation.messages.map((message) => (
          <div
            key={message.id}
            className={`rounded-lg border border-border p-4 ${
              message.direction === "outbound"
                ? "bg-primary/5 ml-12"
                : "bg-muted/50"
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-medium text-primary">
                    {message.fromEmail[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {message.fromEmail}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    to: {message.toEmails.join(", ")}
                  </p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatDate(message.sentAt)}
              </span>
            </div>
            <div className="email-content">
              {message.bodyHtml ? (
                <div
                  className="bg-white text-gray-900 p-4 rounded border border-gray-200 overflow-auto max-h-96"
                  dangerouslySetInnerHTML={{ __html: message.bodyHtml }}
                />
              ) : (
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {message.bodyText}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Reply Section */}
      <div className="border-t border-border p-6">
        <div className="mb-4">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Type your reply..."
            className="w-full min-h-32 p-4 bg-muted rounded-lg border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={handleSend}
              disabled={!replyText.trim() || sending}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Replying to {selectedConversation.customer.primaryEmail}
          </p>
        </div>
      </div>
    </div>
  );
}
