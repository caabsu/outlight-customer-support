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
  const [markingNonSupport, setMarkingNonSupport] = useState(false);
  const [undoTimer, setUndoTimer] = useState<number | null>(null);
  const [undoTimeout, setUndoTimeout] = useState<NodeJS.Timeout | null>(null);

  // Fetch conversation history
  useEffect(() => {
    if (selectedConversation?.id) {
      fetch(`/api/conversations/${selectedConversation.id}/history`)
        .then((res) => res.json())
        .then((data) => setHistory(data))
        .catch((err) => console.error("Failed to fetch history:", err));
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

    const conversationId = selectedConversation.id;

    // Show optimistic update immediately
    setMarkingNonSupport(true);
    setUndoTimer(5); // 5 seconds

    // Countdown timer
    const countdownInterval = setInterval(() => {
      setUndoTimer((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownInterval);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    // Set timeout to actually archive after 5 seconds
    const timeout = setTimeout(async () => {
      try {
        await fetch(`/api/conversations/${conversationId}/archive`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tag: "non-customer-support" }),
        });
        await refreshConversations();
      } catch (error) {
        console.error("Failed to mark as non-support:", error);
      } finally {
        setMarkingNonSupport(false);
        setUndoTimer(null);
        setUndoTimeout(null);
      }
    }, 5000);

    setUndoTimeout(timeout);
  };

  const handleUndoMarkNonSupport = () => {
    if (undoTimeout) {
      clearTimeout(undoTimeout);
      setUndoTimeout(null);
      setUndoTimer(null);
      setMarkingNonSupport(false);
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
      <div className="flex-1 flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Select a conversation</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex bg-background overflow-hidden">
      {/* Main Email View */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header - Fixed Height */}
        <div className="p-6 border-b border-border shrink-0">
          <h2 className="text-xl font-semibold text-foreground mb-3">
            {selectedConversation.subject}
          </h2>
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
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

          {/* Tag Management */}
          <div className="flex items-center gap-2 flex-wrap">
            {selectedConversation.tags?.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-md border border-primary/20"
              >
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="hover:text-primary/70 ml-1"
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
                  className="px-2 py-1 text-xs bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary w-24"
                  autoFocus
                />
                <button
                  onClick={handleAddTag}
                  className="px-2 py-1 bg-success text-white text-xs rounded-md hover:bg-success/90"
                >
                  Add
                </button>
                <button
                  onClick={() => { setEditingTags(false); setNewTag(""); }}
                  className="px-2 py-1 bg-muted text-muted-foreground text-xs rounded-md hover:bg-muted/80"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingTags(true)}
                className="px-2 py-1 bg-muted text-muted-foreground text-xs rounded-md hover:bg-accent transition-colors"
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
                  className="email-html-container p-4 rounded border border-gray-200 overflow-auto max-h-96"
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
            Replying to {getReplyToEmail()}
          </p>
        </div>
      </div>
    </div>

    {/* Right Sidebar */}
    <div className="w-80 border-l border-border bg-secondary flex flex-col shrink-0">
      {/* Past Conversations Header - Fixed Size */}
      {showHistory && history.length > 0 && (
        <>
          <div className="px-4 py-2 border-b border-border flex items-center justify-between shrink-0">
            <h3 className="font-sans font-semibold text-foreground text-sm">Past Conversations</h3>
            <button
              onClick={() => setShowHistory(false)}
              className="text-muted-foreground hover:text-foreground transition-colors text-xs"
            >
              ✕
            </button>
          </div>

          {/* Past Conversations List - Max 20% of viewport height */}
          <div className="overflow-y-auto px-4 py-2 space-y-2 max-h-[20vh]">
            {history.map((conv) => (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                className="w-full text-left p-2 border border-border bg-background hover:border-primary hover:bg-accent/50 transition-all cursor-pointer"
              >
                <p className="text-xs font-medium text-foreground mb-1 truncate">
                  {conv.subject}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(conv.lastMessageAt).toLocaleDateString()} •{" "}
                  {conv.messages.length} msg
                </p>
              </button>
            ))}
          </div>

          {/* Not Support Button - Right below past conversations */}
          <div className="p-4 border-t border-border shrink-0">
            {!selectedConversation.tags?.includes("non-customer-support") && (
              <>
                {undoTimer !== null ? (
                  <div className="space-y-2">
                    <div className="w-full px-4 py-3 bg-warning text-white border-2 border-warning text-sm font-medium text-center">
                      Archiving in {undoTimer}s...
                    </div>
                    <button
                      onClick={handleUndoMarkNonSupport}
                      className="w-full px-4 py-3 bg-success text-white border-2 border-success text-sm font-medium hover:bg-success/90 transition-colors"
                    >
                      Undo
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleMarkNonSupport}
                    disabled={markingNonSupport}
                    className="w-full px-4 py-3 bg-warning text-white border-2 border-warning text-sm font-medium hover:bg-warning/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Mark as Non-Support
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
    </div>
  );
}
