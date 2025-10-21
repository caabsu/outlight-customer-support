"use client";

import { useConversations } from "@/lib/ConversationContext";
import { useState } from "react";

type Conversation = {
  id: string;
  subject: string;
  customerId: string;
  status: string;
  lastMessageAt: string;
  unreadAgent: boolean;
  starred: boolean;
  archived: boolean;
  tags: string[];
  customer: {
    name: string | null;
    primaryEmail: string;
  };
  messages: {
    bodyText: string | null;
    fromEmail: string;
    direction: string;
  }[];
};

export default function ConversationList() {
  const { conversations, selectedConversation, selectConversation, loading, refreshConversations, updateConversationOptimistic } =
    useConversations();
  const [showStarred, setShowStarred] = useState(false);
  const [excludeNonSupport, setExcludeNonSupport] = useState(true);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const filteredConversations = conversations.filter((conv: Conversation) => {
    if (showStarred && !conv.starred) return false;
    if (excludeNonSupport && conv.tags?.includes("non-customer-support"))
      return false;
    if (showUnreadOnly && !conv.unreadAgent) return false;
    return true;
  });

  const handleStar = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();

    // Find the conversation to get current state
    const conv = conversations.find(c => c.id === convId);
    if (!conv) return;

    // Optimistic update - instant UI feedback
    updateConversationOptimistic(convId, { starred: !conv.starred });

    try {
      await fetch(`/api/conversations/${convId}/star`, {
        method: "PATCH",
      });
      // Refresh to ensure we're in sync with server
      await refreshConversations();
    } catch (error) {
      console.error("Failed to toggle star:", error);
      // Revert on error
      updateConversationOptimistic(convId, { starred: conv.starred });
    }
  };

  const handleMarkNonSupport = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    if (confirm("Mark this email as non-customer-support and archive it?")) {
      try {
        await fetch(`/api/conversations/${convId}/archive`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tag: "non-customer-support" }),
        });
        await refreshConversations();
      } catch (error) {
        console.error("Failed to mark as non-support:", error);
      }
    }
  };

  const goToNextUnreplied = async () => {
    try {
      const currentId = selectedConversation?.id;
      const endpoint = currentId
        ? `/api/conversations/next-unreplied/${currentId}`
        : "/api/conversations/next-unreplied";

      // Start fetching immediately
      const fetchPromise = fetch(endpoint).then(res => res.json());

      // Show instant loading state if desired
      const nextConv = await fetchPromise;

      if (nextConv && nextConv.id) {
        // Instant navigation
        selectConversation(nextConv.id);
      } else {
        alert("No more unreplied emails!");
      }
    } catch (error) {
      console.error("Failed to get next unreplied:", error);
    }
  };

  const getPreview = (conv: Conversation) => {
    const lastMessage = conv.messages[conv.messages.length - 1];
    return lastMessage?.bodyText?.slice(0, 80) || "No content";
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } else if (diffInHours < 168) {
      return date.toLocaleDateString("en-US", { weekday: "short" });
    } else {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
  };

  const isUnreplied = (conv: Conversation) => {
    if (conv.messages.length === 0) return false;
    const lastMessage = conv.messages[conv.messages.length - 1];
    return lastMessage.direction === "inbound";
  };

  if (loading) {
    return (
      <div className="w-96 border-r border-border bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="w-96 border-r border-border bg-background flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Conversations</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {filteredConversations.length} threads
            </p>
          </div>
          <button
            onClick={goToNextUnreplied}
            className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
            title="Go to next unreplied email"
          >
            Next →
          </button>
        </div>

        {/* Filter Buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowStarred(!showStarred)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showStarred
                ? "bg-starred/20 text-starred border border-starred/30"
                : "bg-secondary text-secondary-foreground border border-border"
            }`}
          >
            ⭐ Starred
          </button>
          <button
            onClick={() => setExcludeNonSupport(!excludeNonSupport)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              excludeNonSupport
                ? "bg-primary/20 text-primary border border-primary/30"
                : "bg-secondary text-secondary-foreground border border-border"
            }`}
          >
            ✓ CS Only
          </button>
          <button
            onClick={() => setShowUnreadOnly(!showUnreadOnly)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showUnreadOnly
                ? "bg-warning/20 text-warning border border-warning/30"
                : "bg-secondary text-secondary-foreground border border-border"
            }`}
          >
            Unread
          </button>
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground text-sm">No conversations match filters</p>
          </div>
        ) : (
          filteredConversations.map((conv: Conversation) => (
            <div
              key={conv.id}
              onClick={() => selectConversation(conv.id)}
              className={`w-full text-left p-4 border-b border-border transition-colors relative cursor-pointer ${
                selectedConversation?.id === conv.id
                  ? "bg-accent"
                  : "hover:bg-accent/50"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex-1 min-w-0 flex items-start gap-2">
                  <button
                    onClick={(e) => handleStar(e, conv.id)}
                    className="mt-0.5 text-lg hover:scale-110 transition-transform text-yellow-400 hover:text-yellow-300"
                    title={conv.starred ? "Unstar" : "Star"}
                  >
                    {conv.starred ? "⭐" : "☆"}
                  </button>
                  <p className="text-sm font-medium text-foreground truncate">
                    {conv.customer.name || conv.customer.primaryEmail}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatDate(conv.lastMessageAt)}
                </span>
              </div>
              <p className="text-sm font-medium text-foreground truncate mb-1 ml-7">
                {conv.subject}
              </p>
              <p className="text-sm text-muted-foreground line-clamp-2 ml-7">
                {getPreview(conv)}
              </p>
              <div className="flex items-center gap-2 mt-2 ml-7">
                {conv.unreadAgent && (
                  <span className="tag tag-primary">Unread</span>
                )}
                {isUnreplied(conv) && (
                  <span className="tag tag-warning">Needs Reply</span>
                )}
                {conv.tags?.map((tag) => (
                  <span key={tag} className="tag tag-muted">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
