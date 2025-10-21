"use client";

import { useState, useEffect } from "react";
import { useConversations } from "@/lib/ConversationContext";
import { useRouter } from "next/navigation";

type ConversationHistory = {
  id: string;
  subject: string;
  lastMessageAt: string;
  messages: { direction: string }[];
};

export default function ConversationView() {
  const { selectedConversation, selectConversation, refreshConversations, updateConversationOptimistic } = useConversations();
  const router = useRouter();
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<ConversationHistory[]>([]);
  const [showHistory, setShowHistory] = useState(true);
  const [editingTags, setEditingTags] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Fetch conversation history
  useEffect(() => {
    if (selectedConversation?.id) {
      setLoadingHistory(true);
      setHistory([]);
      fetch(`/api/conversations/${selectedConversation.id}/history`)
        .then((res) => res.json())
        .then((data) => {
          setHistory(data);
          setLoadingHistory(false);
        })
        .catch((err) => {
          console.error("Failed to fetch history:", err);
          setLoadingHistory(false);
        });
    } else {
      setHistory([]);
      setLoadingHistory(false);
    }
  }, [selectedConversation?.id]);

  // Get the correct reply-to email
  const getReplyToEmail = () => {
    if (!selectedConversation) return "";

    // Find the most recent inbound message
    const inboundMessages = selectedConversation.messages.filter(
      (m) => m.direction === "inbound"
    );

    if (inboundMessages.length > 0) {
      const lastInbound = inboundMessages[inboundMessages.length - 1];
      // Use Reply-To if it exists, otherwise fall back to fromEmail
      return lastInbound.replyToEmail || lastInbound.fromEmail;
    }

    return selectedConversation.customer.primaryEmail;
  };

  const handleSend = async () => {
    if (!replyText.trim() || !selectedConversation) return;

    setSending(true);
    try {
      const recipientEmail = getReplyToEmail();

      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          to: recipientEmail,
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

  const handleMarkNonSupport = async () => {
    if (!selectedConversation) return;

    const currentTags = selectedConversation.tags || [];
    const updatedTags = [...currentTags, "non-customer-support"];

    // Optimistic update - instant UI feedback
    updateConversationOptimistic(selectedConversation.id, { tags: updatedTags });

    try {
      await fetch(`/api/conversations/${selectedConversation.id}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: updatedTags }),
      });
      await refreshConversations();
    } catch (error) {
      console.error("Failed to mark as non-support:", error);
      // Revert on error
      updateConversationOptimistic(selectedConversation.id, { tags: currentTags });
    }
  };

  const handleAddTag = async () => {
    if (!newTag.trim() || !selectedConversation) return;

    const currentTags = selectedConversation.tags || [];
    if (currentTags.includes(newTag.trim())) {
      setNewTag("");
      return;
    }

    const updatedTags = [...currentTags, newTag.trim()];

    // Optimistic update - instant UI feedback
    updateConversationOptimistic(selectedConversation.id, { tags: updatedTags });
    setNewTag("");
    setEditingTags(false);

    try {
      await fetch(`/api/conversations/${selectedConversation.id}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: updatedTags }),
      });
      await refreshConversations();
    } catch (error) {
      console.error("Failed to add tag:", error);
      // Revert on error
      updateConversationOptimistic(selectedConversation.id, { tags: currentTags });
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    if (!selectedConversation) return;

    const currentTags = selectedConversation.tags || [];
    const newTags = currentTags.filter(tag => tag !== tagToRemove);

    // Optimistic update - instant UI feedback
    updateConversationOptimistic(selectedConversation.id, { tags: newTags });

    try {
      await fetch(`/api/conversations/${selectedConversation.id}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: newTags }),
      });
      await refreshConversations();
    } catch (error) {
      console.error("Failed to remove tag:", error);
      // Revert on error
      updateConversationOptimistic(selectedConversation.id, { tags: currentTags });
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
      <div className="flex-1 flex flex-col items-center justify-center bg-background p-12">
        <div className="max-w-md text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-8 h-8 text-primary"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-sans font-semibold text-foreground">Inbox</h2>
          <p className="text-muted-foreground font-sans">
            Select a conversation from the list to view and reply to messages
          </p>
          <div className="pt-4 space-y-2 text-sm font-sans text-muted-foreground">
            <p className="flex items-center gap-2 justify-center">
              <span className="text-primary">→</span>
              Use filters to find specific conversations
            </p>
            <p className="flex items-center gap-2 justify-center">
              <span className="text-primary">→</span>
              Click "Next" to jump to unreplied emails
            </p>
            <p className="flex items-center gap-2 justify-center">
              <span className="text-primary">→</span>
              Star important conversations for quick access
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex bg-background overflow-hidden" style={{ fontFamily: "var(--font-roboto), sans-serif" }}>
      {/* Main Email View */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header - Fixed Height */}
        <div className="p-6 border-b border-border shrink-0">
          <h2 className="text-xl font-sans font-semibold text-foreground mb-3">
            {selectedConversation.subject}
          </h2>
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-sm font-sans font-medium text-primary">
                  {(selectedConversation.customer.name || selectedConversation.customer.primaryEmail)[0].toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-sm font-sans font-medium text-foreground">
                  {selectedConversation.customer.name || selectedConversation.customer.primaryEmail}
                </p>
                <p className="text-xs font-sans text-muted-foreground">
                  {selectedConversation.customer.primaryEmail}
                </p>
              </div>
            </div>
          </div>

          {/* Tag Management */}
          <div className="flex items-center gap-2 flex-wrap">
            {selectedConversation.tags?.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs font-sans rounded-md border border-primary/20"
              >
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="hover:text-primary/70 ml-1 font-sans"
                  title="Remove tag"
                >
                  ✕
                </button>
              </span>
            ))}
            {editingTags ? (
              <div className="inline-flex items-center gap-1">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                  placeholder="New tag..."
                  className="px-2 py-1 text-xs font-sans bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary w-24"
                  autoFocus
                />
                <button
                  onClick={handleAddTag}
                  className="px-2 py-1 bg-success text-white text-xs font-sans rounded-md hover:bg-success/90"
                >
                  Add
                </button>
                <button
                  onClick={() => { setEditingTags(false); setNewTag(""); }}
                  className="px-2 py-1 bg-muted text-muted-foreground text-xs font-sans rounded-md hover:bg-muted/80"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingTags(true)}
                className="px-2 py-1 bg-muted text-muted-foreground text-xs font-sans rounded-md hover:bg-accent transition-colors"
              >
                + Tag
              </button>
            )}
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
                  <span className="text-xs font-sans font-medium text-primary">
                    {message.fromEmail[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-sans font-medium text-foreground">
                    {message.fromEmail}
                  </p>
                  <p className="text-xs font-sans text-muted-foreground">
                    to: {message.toEmails.join(", ")}
                  </p>
                </div>
              </div>
              <span className="text-xs font-sans text-muted-foreground">
                {formatDate(message.sentAt)}
              </span>
            </div>
            <div className="email-content">
              {message.bodyHtml ? (
                <div
                  className="email-html-container font-sans p-4 rounded border border-gray-200 overflow-auto"
                  dangerouslySetInnerHTML={{ __html: message.bodyHtml }}
                />
              ) : (
                <p className="text-sm font-sans text-foreground whitespace-pre-wrap">
                  {message.bodyText}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Reply Section */}
      <div className="border-t border-border p-6 shrink-0">
        <div className="mb-4">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Type your reply..."
            className="w-full min-h-32 p-4 font-sans bg-muted rounded-lg border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={handleSend}
              disabled={!replyText.trim() || sending}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-sans font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
          <p className="text-xs font-sans text-muted-foreground">
            Replying to {getReplyToEmail()}
          </p>
        </div>
      </div>
    </div>

    {/* Right Sidebar */}
    <div className="w-80 border-l border-border bg-secondary flex flex-col shrink-0">
      {/* Past Conversations Header - Always Visible */}
      {showHistory && (
        <>
          <div className="px-4 py-4 border-b border-border flex items-center justify-between shrink-0">
            <h3 className="font-sans font-semibold text-foreground text-base">Past Conversations</h3>
            <button
              onClick={() => setShowHistory(false)}
              className="text-muted-foreground hover:text-foreground transition-colors text-xs font-sans"
            >
              ✕
            </button>
          </div>

          {/* Past Conversations List - Max 20% of viewport height */}
          <div className="overflow-y-auto px-4 py-2 space-y-2 max-h-[20vh]">
            {loadingHistory ? (
              // Loading skeleton with consistent box size
              <>
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="w-full p-2 border border-border bg-background/50 animate-pulse h-[52px]"
                  >
                    <div className="h-3 bg-muted rounded w-3/4 mb-2"></div>
                    <div className="h-2 bg-muted rounded w-1/2"></div>
                  </div>
                ))}
              </>
            ) : history.length > 0 ? (
              history.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => selectConversation(conv.id)}
                  className="w-full text-left p-2 border border-border bg-background hover:border-primary hover:bg-accent/50 transition-all cursor-pointer h-[52px]"
                >
                  <p className="text-xs font-sans font-medium text-foreground mb-1 truncate">
                    {conv.subject}
                  </p>
                  <p className="text-[10px] font-sans text-muted-foreground truncate">
                    {new Date(conv.lastMessageAt).toLocaleDateString()} •{" "}
                    {conv.messages.length} msg
                  </p>
                </button>
              ))
            ) : (
              <div className="p-4 text-center h-[52px] flex items-center justify-center">
                <p className="text-xs font-sans text-muted-foreground">No past conversations</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Not Support Button - Always visible, below past conversations */}
      <div className="p-4 border-t border-border shrink-0">
        {!selectedConversation.tags?.includes("non-customer-support") && (
          <button
            onClick={handleMarkNonSupport}
            className="w-full px-4 py-3 bg-warning text-white border-2 border-warning text-sm font-sans font-medium hover:bg-warning/90 transition-all"
          >
            Mark as Non-Support
          </button>
        )}
      </div>
    </div>
    </div>
  );
}
