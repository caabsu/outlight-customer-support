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
  const { conversations, selectedConversation, selectConversation, loading, refreshing, refreshConversations, pollAndRefresh, updateConversationOptimistic, showArchived } =
    useConversations();
  const [showStarred, setShowStarred] = useState(false);
  const [excludeNonSupport, setExcludeNonSupport] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "needs-reply" | "resolved">("all");
  const [dateRange, setDateRange] = useState<"all" | "today" | "week" | "month">("all");

  // Get all unique tags from conversations
  const allTags = Array.from(
    new Set(
      conversations.flatMap((conv: Conversation) => conv.tags || [])
    )
  ).sort();

  const filteredConversations = conversations.filter((conv: Conversation) => {
    // Starred filter
    if (showStarred && !conv.starred) return false;

    // Non-support filter
    if (excludeNonSupport && conv.tags?.includes("non-customer-support"))
      return false;

    // Archive filter
    if (showArchived && !conv.archived) return false;
    if (!showArchived && conv.archived) return false;

    // Tag filter (must have ALL selected tags)
    if (selectedTags.length > 0) {
      const hasAllTags = selectedTags.every(tag => conv.tags?.includes(tag));
      if (!hasAllTags) return false;
    }

    // Status filter
    if (statusFilter === "needs-reply" && !isUnreplied(conv)) return false;
    if (statusFilter === "resolved" && isUnreplied(conv)) return false;

    // Date range filter
    if (dateRange !== "all") {
      const messageDate = new Date(conv.lastMessageAt);
      const now = new Date();
      const diffInHours = (now.getTime() - messageDate.getTime()) / (1000 * 60 * 60);

      if (dateRange === "today" && diffInHours > 24) return false;
      if (dateRange === "week" && diffInHours > 168) return false;
      if (dateRange === "month" && diffInHours > 720) return false;
    }

    return true;
  });

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

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

  const handleUnarchive = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    const conv = conversations.find(c => c.id === convId);
    if (!conv) return;

    // Optimistic update
    updateConversationOptimistic(convId, { archived: false });

    try {
      // Remove non-customer-support tag and unarchive
      const newTags = (conv.tags || []).filter(tag => tag !== "non-customer-support");
      await fetch(`/api/conversations/${convId}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: newTags }),
      });
      // Update archived status
      await fetch(`/api/conversations/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: false }),
      });
      await refreshConversations();
    } catch (error) {
      console.error("Failed to unarchive:", error);
      // Revert on error
      updateConversationOptimistic(convId, { archived: conv.archived });
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
    <div className="w-96 border-r border-border bg-background flex flex-col relative" style={{ fontFamily: "Roboto, sans-serif" }}>
      {/* Refresh Progress Indicator */}
      {refreshing && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-primary/20 z-50 overflow-hidden">
          <div className="h-full bg-primary animate-pulse w-full"></div>
        </div>
      )}

      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-sans font-semibold text-foreground">Conversations</h2>
            <p className="text-sm font-sans text-muted-foreground mt-1">
              {filteredConversations.length} threads
            </p>
          </div>
          <button
            onClick={() => pollAndRefresh()}
            className="px-3 py-1.5 bg-secondary text-secondary-foreground rounded-lg text-xs font-sans font-medium hover:bg-accent transition-colors border border-border"
            title="Check for new emails"
            disabled={loading}
          >
            ↻
          </button>
        </div>

        {/* Quick Filter Buttons */}
        <div className="flex flex-wrap gap-2 mb-2">
          <button
            onClick={() => setShowStarred(!showStarred)}
            className={`px-3 py-1.5 rounded-lg text-xs font-sans font-medium transition-colors ${
              showStarred
                ? "bg-starred/20 text-starred border border-starred/30"
                : "bg-secondary text-secondary-foreground border border-border"
            }`}
          >
            ⭐ Starred
          </button>
          <button
            onClick={() => setExcludeNonSupport(!excludeNonSupport)}
            className={`px-3 py-1.5 rounded-lg text-xs font-sans font-medium transition-colors ${
              excludeNonSupport
                ? "bg-primary/20 text-primary border border-primary/30"
                : "bg-secondary text-secondary-foreground border border-border"
            }`}
          >
            ✓ CS Only
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-1.5 rounded-lg text-xs font-sans font-medium transition-colors ${
              showFilters || selectedTags.length > 0 || statusFilter !== "all" || dateRange !== "all"
                ? "bg-primary/20 text-primary border border-primary/30"
                : "bg-secondary text-secondary-foreground border border-border"
            }`}
          >
            🔍 Filters {(selectedTags.length > 0 || statusFilter !== "all" || dateRange !== "all") && `(${selectedTags.length + (statusFilter !== "all" ? 1 : 0) + (dateRange !== "all" ? 1 : 0)})`}
          </button>
        </div>

        {/* Advanced Filters Panel */}
        {showFilters && (
          <div className="mt-3 p-3 bg-secondary rounded-lg border border-border space-y-3">
            {/* Status Filter */}
            <div>
              <label className="text-xs font-sans font-medium text-muted-foreground mb-1.5 block">Status</label>
              <div className="flex gap-1.5">
                {(["all", "needs-reply", "resolved"] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`flex-1 px-2 py-1.5 rounded text-xs font-sans font-medium transition-colors ${
                      statusFilter === status
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {status === "all" ? "All" : status === "needs-reply" ? "Needs Reply" : "Resolved"}
                  </button>
                ))}
              </div>
            </div>

            {/* Date Range Filter */}
            <div>
              <label className="text-xs font-sans font-medium text-muted-foreground mb-1.5 block">Time Period</label>
              <div className="flex gap-1.5">
                {(["all", "today", "week", "month"] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setDateRange(range)}
                    className={`flex-1 px-2 py-1.5 rounded text-xs font-sans font-medium transition-colors ${
                      dateRange === range
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {range === "all" ? "All" : range === "today" ? "Today" : range === "week" ? "This Week" : "This Month"}
                  </button>
                ))}
              </div>
            </div>

            {/* Tag Filter */}
            {allTags.length > 0 && (
              <div>
                <label className="text-xs font-sans font-medium text-muted-foreground mb-1.5 block">Tags</label>
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`px-2 py-1 rounded text-xs font-sans font-medium transition-colors ${
                        selectedTags.includes(tag)
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Clear Filters */}
            {(selectedTags.length > 0 || statusFilter !== "all" || dateRange !== "all") && (
              <button
                onClick={() => {
                  setSelectedTags([]);
                  setStatusFilter("all");
                  setDateRange("all");
                }}
                className="w-full px-3 py-1.5 bg-muted text-muted-foreground rounded text-xs font-sans font-medium hover:bg-accent transition-colors"
              >
                Clear All Filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground font-sans text-sm">No conversations match filters</p>
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
                    className="mt-0.5 text-lg hover:scale-110 transition-transform text-foreground/60 hover:text-foreground"
                    title={conv.starred ? "Unstar" : "Star"}
                  >
                    {conv.starred ? "⭐" : "☆"}
                  </button>
                  <p className="text-sm font-sans font-medium text-foreground truncate">
                    {conv.customer.name || conv.customer.primaryEmail}
                  </p>
                </div>
                <span className="text-xs font-sans text-muted-foreground shrink-0">
                  {formatDate(conv.lastMessageAt)}
                </span>
              </div>
              <p className="text-sm font-sans font-medium text-foreground truncate mb-1 ml-7">
                {conv.subject}
              </p>
              <p className="text-sm font-sans text-muted-foreground line-clamp-2 ml-7">
                {getPreview(conv)}
              </p>
              {/* Status Badge */}
              {isUnreplied(conv) && (
                <div className="flex items-center gap-2 mt-2 ml-7">
                  <span className="tag tag-warning font-sans">Needs Reply</span>
                </div>
              )}
              {/* Tags - Separate row, more visible */}
              {conv.tags && conv.tags.length > 0 && (
                <div className="flex items-center gap-2 mt-2 ml-7 flex-wrap">
                  {conv.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 bg-primary/15 text-primary text-xs font-sans font-medium border border-primary/30 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {/* Unarchive button for archived items */}
              {conv.archived && (
                <div className="mt-2 ml-7">
                  <button
                    onClick={(e) => handleUnarchive(e, conv.id)}
                    className="text-xs font-sans text-primary hover:text-primary/80 font-medium"
                  >
                    Unarchive
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
