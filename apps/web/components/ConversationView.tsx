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

// Aggressively sanitize email HTML to enforce consistent styling
function sanitizeEmailHtml(html: string): string {
  if (!html) return html;

  let sanitized = html;

  // Remove all <style> tags and their content (embedded CSS)
  sanitized = sanitized.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Remove all class attributes (single and double quotes)
  sanitized = sanitized.replace(/\sclass\s*=\s*"[^"]*"/gi, '');
  sanitized = sanitized.replace(/\sclass\s*=\s*'[^']*'/gi, '');

  // Remove all inline style attributes completely (single and double quotes)
  sanitized = sanitized.replace(/\sstyle\s*=\s*"[^"]*"/gi, '');
  sanitized = sanitized.replace(/\sstyle\s*=\s*'[^']*'/gi, '');

  // DON'T remove width/height from tables and images (needed for layout)
  // Only remove from text elements that break layout
  sanitized = sanitized.replace(/<(span|div|p|h1|h2|h3|h4|h5|h6)[^>]*\s(width|height)\s*=\s*"[^"]*"/gi, '<$1');
  sanitized = sanitized.replace(/<(span|div|p|h1|h2|h3|h4|h5|h6)[^>]*\s(width|height)\s*=\s*'[^']*'/gi, '<$1');

  // Remove any <font> tags but keep their content
  sanitized = sanitized.replace(/<font[^>]*>/gi, '');
  sanitized = sanitized.replace(/<\/font>/gi, '');

  return sanitized;
}

export default function ConversationView() {
  const { conversations, selectedConversation, selectConversation, refreshConversations, updateConversationOptimistic } = useConversations();
  const router = useRouter();
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<ConversationHistory[]>([]);
  const [showHistory, setShowHistory] = useState(true);
  const [editingTags, setEditingTags] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [summaryMinimized, setSummaryMinimized] = useState(false);
  const [activeInfoTooltip, setActiveInfoTooltip] = useState<string | null>(null);

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

  // Manual AI summary generation
  const handleGenerateSummary = async () => {
    if (!selectedConversation?.id) return;

    setLoadingSummary(true);
    setAiSummary(null);
    try {
      const res = await fetch(`/api/conversations/${selectedConversation.id}/summary`, {
        method: "POST"
      });
      const data = await res.json();
      setAiSummary(data.summary);
    } catch (err) {
      console.error("Failed to fetch summary:", err);
    } finally {
      setLoadingSummary(false);
    }
  };

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
    updateConversationOptimistic(selectedConversation.id, {
      tags: updatedTags
    });

    try {
      // Update tags
      await fetch(`/api/conversations/${selectedConversation.id}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: updatedTags }),
      });
      await refreshConversations();
    } catch (error) {
      console.error("Failed to mark as non-support:", error);
      // Revert on error
      updateConversationOptimistic(selectedConversation.id, {
        tags: currentTags
      });
    }
  };

  const goToNextUnreplied = () => {
    // Filter to unreplied conversations (last message is inbound)
    const unrepliedConversations = conversations.filter((conv) => {
      // Exclude non-customer-support
      if (conv.tags?.includes("non-customer-support")) return false;

      // Check if last message is inbound (needs reply)
      if (conv.messages.length === 0) return false;
      const lastMessage = conv.messages[conv.messages.length - 1];
      return lastMessage.direction === "inbound";
    });

    // Sort by lastMessageAt (oldest first - priority to older unreplied)
    const sortedUnreplied = unrepliedConversations.sort((a, b) =>
      new Date(a.lastMessageAt).getTime() - new Date(b.lastMessageAt).getTime()
    );

    if (sortedUnreplied.length === 0) {
      alert("No unreplied emails!");
      return;
    }

    // Find current conversation index
    const currentIndex = selectedConversation
      ? sortedUnreplied.findIndex(conv => conv.id === selectedConversation.id)
      : -1;

    // Get next conversation (wrap around to start if at end)
    const nextIndex = currentIndex >= sortedUnreplied.length - 1 ? 0 : currentIndex + 1;
    const nextConv = sortedUnreplied[nextIndex];

    // Instant navigation - no API call!
    selectConversation(nextConv.id);
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
    <div className="flex-1 flex bg-background overflow-hidden" style={{ fontFamily: "Roboto, sans-serif" }}>
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-6">
        {selectedConversation.messages.map((message) => (
          <div
            key={message.id}
            className={`rounded-lg border border-border p-4 bg-background ${
              message.direction === "outbound" ? "ml-12" : ""
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-sans text-primary" style={{ fontWeight: 400 }}>
                    {message.fromEmail[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-sans text-foreground" style={{ fontWeight: 400 }}>
                    {message.fromEmail}
                  </p>
                  <p className="text-xs font-sans text-foreground/80" style={{ fontWeight: 400 }}>
                    to: {message.toEmails.join(", ")}
                  </p>
                </div>
              </div>
              <span className="text-xs font-sans text-foreground/70" style={{ fontWeight: 400 }}>
                {formatDate(message.sentAt)}
              </span>
            </div>
            <div className="email-content">
              {message.bodyHtml ? (
                <div
                  className="email-html-container font-sans p-4 rounded border border-border overflow-auto bg-background"
                  style={{ fontWeight: 400, fontSize: '14px', lineHeight: 1.6, maxWidth: '100%' }}
                  dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(message.bodyHtml) }}
                />
              ) : (
                <p className="text-sm font-sans text-foreground whitespace-pre-wrap" style={{ fontWeight: 400 }}>
                  {message.bodyText}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* AI Actions Block - Minimal Design */}
      <div className="border-t border-border p-4 shrink-0 bg-purple-500/5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-0.5 h-5 bg-purple-500 rounded-full"></div>
          <h3 className="text-sm font-sans font-semibold text-foreground" style={{ fontWeight: 600 }}>AI Assistant</h3>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {/* AI Action 1: Generate Summary */}
          <div className="relative">
            <button
              onClick={handleGenerateSummary}
              disabled={loadingSummary}
              className="w-full px-3 py-2 bg-background border border-border rounded-md hover:border-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between gap-1"
            >
              <span className="text-xs font-sans text-foreground" style={{ fontWeight: 400 }}>
                {loadingSummary ? "..." : "Summary"}
              </span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveInfoTooltip(activeInfoTooltip === 'summary' ? null : 'summary');
                }}
                className="text-purple-500 hover:text-purple-600 transition-colors cursor-pointer"
                title="Info"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </span>
            </button>
            {activeInfoTooltip === 'summary' && (
              <div className="absolute top-full left-0 right-0 mt-1 p-2 bg-purple-500 text-white text-xs rounded-md shadow-lg z-10" style={{ fontWeight: 400 }}>
                Create an intelligent summary highlighting key points, issues, and next steps
              </div>
            )}
          </div>

          {/* AI Action 2: Draft Reply */}
          <div className="relative">
            <button
              disabled
              className="w-full px-3 py-2 bg-background border border-border rounded-md opacity-40 cursor-not-allowed flex items-center justify-between gap-1"
            >
              <span className="text-xs font-sans text-foreground" style={{ fontWeight: 400 }}>Draft</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveInfoTooltip(activeInfoTooltip === 'draft' ? null : 'draft');
                }}
                className="text-muted-foreground cursor-pointer"
                title="Info"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </span>
            </button>
            {activeInfoTooltip === 'draft' && (
              <div className="absolute top-full left-0 right-0 mt-1 p-2 bg-muted text-foreground text-xs rounded-md shadow-lg z-10" style={{ fontWeight: 400 }}>
                Generate context-aware reply suggestions (Coming Soon)
              </div>
            )}
          </div>

          {/* AI Action 3: Suggest Tags */}
          <div className="relative">
            <button
              disabled
              className="w-full px-3 py-2 bg-background border border-border rounded-md opacity-40 cursor-not-allowed flex items-center justify-between gap-1"
            >
              <span className="text-xs font-sans text-foreground" style={{ fontWeight: 400 }}>Tags</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveInfoTooltip(activeInfoTooltip === 'tags' ? null : 'tags');
                }}
                className="text-muted-foreground cursor-pointer"
                title="Info"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </span>
            </button>
            {activeInfoTooltip === 'tags' && (
              <div className="absolute top-full left-0 right-0 mt-1 p-2 bg-muted text-foreground text-xs rounded-md shadow-lg z-10" style={{ fontWeight: 400 }}>
                Automatically categorize with intelligent tag recommendations (Coming Soon)
              </div>
            )}
          </div>

          {/* AI Action 4: Find Similar */}
          <div className="relative">
            <button
              disabled
              className="w-full px-3 py-2 bg-background border border-border rounded-md opacity-40 cursor-not-allowed flex items-center justify-between gap-1"
            >
              <span className="text-xs font-sans text-foreground" style={{ fontWeight: 400 }}>Similar</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveInfoTooltip(activeInfoTooltip === 'similar' ? null : 'similar');
                }}
                className="text-muted-foreground cursor-pointer"
                title="Info"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </span>
            </button>
            {activeInfoTooltip === 'similar' && (
              <div className="absolute top-full left-0 right-0 mt-1 p-2 bg-muted text-foreground text-xs rounded-md shadow-lg z-10" style={{ fontWeight: 400 }}>
                Discover similar conversations and past solutions (Coming Soon)
              </div>
            )}
          </div>
        </div>

        {/* AI Summary Display */}
        {aiSummary && (
          <div className="mt-5 p-5 bg-purple-500/5 border border-purple-500/20 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                <h4 className="text-sm font-sans font-bold text-purple-600">AI-Generated Summary</h4>
              </div>
              <button
                onClick={() => setSummaryMinimized(!summaryMinimized)}
                className="text-xs font-sans font-medium text-purple-500 hover:text-purple-600 transition-colors px-2 py-1"
                title={summaryMinimized ? "Expand summary" : "Minimize summary"}
              >
                {summaryMinimized ? "Expand ▼" : "Minimize ▲"}
              </button>
            </div>
            {!summaryMinimized && (
              <p className="text-sm font-sans text-foreground leading-relaxed whitespace-pre-wrap">{aiSummary}</p>
            )}
          </div>
        )}
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
          <button
            onClick={handleSend}
            disabled={!replyText.trim() || sending}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-sans font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? "Sending..." : "Send"}
          </button>
          <p className="text-xs font-sans text-muted-foreground">
            Replying to {getReplyToEmail()}
          </p>
        </div>
      </div>
    </div>

    {/* Right Sidebar */}
    <div className="w-80 border-l border-border bg-background flex flex-col shrink-0 overflow-hidden">
      {/* Past Conversations Section */}
      <div className="border-b border-border">
        <div className="px-6 py-4 bg-secondary/30">
          <div className="flex items-center justify-between">
            <h3 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide">Past Conversations</h3>
            <button
              onClick={() => setShowAllHistory(true)}
              className="text-xs font-sans font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              View All →
            </button>
          </div>
        </div>

        <div className="max-h-[200px] overflow-y-auto px-4 py-3 space-y-2">
          {loadingHistory ? (
            <>
              {[1, 2].map((i) => (
                <div key={i} className="w-full p-3 bg-secondary/50 animate-pulse rounded-lg">
                  <div className="h-3 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-2 bg-muted rounded w-1/2"></div>
                </div>
              ))}
            </>
          ) : history.length > 0 ? (
            history.slice(0, 3).map((conv) => (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                className="w-full text-left p-3 bg-secondary/50 hover:bg-secondary border border-transparent hover:border-primary/20 transition-all cursor-pointer rounded-lg group"
              >
                <p className="text-xs font-sans font-semibold text-foreground mb-1 truncate group-hover:text-primary transition-colors">
                  {conv.subject}
                </p>
                <p className="text-[10px] font-sans text-muted-foreground truncate">
                  {new Date(conv.lastMessageAt).toLocaleDateString()} • {conv.messages.length} messages
                </p>
              </button>
            ))
          ) : (
            <div className="p-6 text-center">
              <p className="text-xs font-sans text-muted-foreground">No past conversations</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions Section */}
      <div className="border-b border-border">
        <div className="px-6 py-4 bg-secondary/30">
          <h3 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide">Quick Actions</h3>
        </div>

        <div className="px-4 py-4 space-y-3">
          {/* Next Unreplied Button */}
          <button
            onClick={goToNextUnreplied}
            className="w-full px-4 py-3.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg transition-all shadow-sm hover:shadow-md group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                  />
                </svg>
                <span className="text-sm font-sans font-bold">Next Unreplied</span>
              </div>
              <span className="text-xs font-sans font-medium opacity-80">→</span>
            </div>
          </button>

          {/* Mark as Non-Support Button */}
          {!selectedConversation.tags?.includes("non-customer-support") && (
            <button
              onClick={handleMarkNonSupport}
              className="w-full px-4 py-3.5 bg-background border-2 border-red-500/20 hover:border-red-500 hover:bg-red-50 text-foreground rounded-lg transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-5 h-5 text-red-500"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
                    />
                  </svg>
                  <span className="text-sm font-sans font-bold group-hover:text-red-600">Mark as Non-Support</span>
                </div>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1"></div>
    </div>

    {/* View All Past Conversations Modal */}
    {showAllHistory && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-background border border-border rounded-lg w-[600px] max-h-[80vh] flex flex-col shadow-xl">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
            <h2 className="text-lg font-sans font-bold text-foreground">All Past Conversations</h2>
            <button
              onClick={() => setShowAllHistory(false)}
              className="text-muted-foreground hover:text-foreground transition-colors text-xl"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {loadingHistory ? (
              <>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="w-full p-4 border border-border bg-background/50 animate-pulse rounded-lg">
                    <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </div>
                ))}
              </>
            ) : history.length > 0 ? (
              history.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => {
                    selectConversation(conv.id);
                    setShowAllHistory(false);
                  }}
                  className="w-full text-left p-4 border border-border bg-background hover:border-primary hover:bg-accent/50 transition-all cursor-pointer rounded-lg"
                >
                  <p className="text-sm font-sans font-semibold text-foreground mb-1">
                    {conv.subject}
                  </p>
                  <p className="text-xs font-sans text-muted-foreground">
                    {new Date(conv.lastMessageAt).toLocaleDateString()} • {conv.messages.length} messages
                  </p>
                </button>
              ))
            ) : (
              <div className="p-8 text-center">
                <p className="text-sm font-sans text-muted-foreground">No past conversations found</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )}
    </div>
  );
}
