"use client";

import { useConversations, type Conversation } from "@/lib/ConversationContext";
import { useState } from "react";
import WorkspaceSwitcher from "./WorkspaceSwitcher";

export default function ConversationList() {
  const {
    conversations,
    selectedConversation,
    selectConversation,
    loading,
    refreshing,
    refreshProgress,
    refreshConversations,
    pollAndRefresh,
    updateConversationOptimistic,
    showArchived,
    showSent,
    pagination,
    nextPage,
    prevPage,
    pageTransitioning,
    // Filters from context
    showStarred,
    setShowStarred,
    excludeNonSupport,
    setExcludeNonSupport,
    showNeedsReply,
    setShowNeedsReply,
    selectedTags,
    setSelectedTags,
    statusFilter,
    setStatusFilter,
    dateRange,
    setDateRange,
    adminOnly,
    setAdminOnly,
  } = useConversations();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Get all unique tags from conversations
  // NEW V2: Use userTags instead of tags (no need to filter out system tags anymore)
  const allTags = Array.from(
    new Set(
      conversations.flatMap((conv: Conversation) =>
        (conv.userTags || [])
      )
    )
  ).sort();

  // Helper function to check if conversation is unreplied
  // NEW V2: Check needsReply boolean instead of tags array
  const isUnreplied = (conv: Conversation) => {
    // NEW V2: Check needsReply boolean field
    if (conv.needsReply !== undefined) {
      return conv.needsReply;
    }

    // Fallback to last message direction check (for conversations migrating to V2)
    if (conv.messages.length === 0) return false;
    const lastMessage = conv.messages[conv.messages.length - 1];
    return lastMessage.direction === "inbound";
  };

  // No client-side filtering needed - all filtering is done server-side
  // Conversations from context are already filtered and paginated

  const toggleTag = (tag: string) => {
    const newTags = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag];
    setSelectedTags(newTags);
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
      // NEW V2: Use userTags instead of tags
      const newUserTags = (conv.userTags || []).filter(tag => tag !== "non-customer-support");
      await fetch(`/api/conversations/${convId}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: newUserTags }),
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

  return (
    <div className={`${isCollapsed ? 'w-12' : 'w-96'} border-r border-border bg-background flex flex-col relative transition-all duration-300 shrink-0`} style={{ fontFamily: "Roboto, sans-serif" }}>
      {/* Refresh Progress Indicator */}
      {refreshing && (
        <div className="absolute top-0 left-0 right-0 z-50">
          <div className="h-1 bg-primary/20 overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${refreshProgress}%` }}
            ></div>
          </div>
          <div className="flex justify-center py-1 bg-primary/5">
            <span className="text-xs font-sans font-medium text-primary">
              {refreshProgress}% - {refreshProgress < 30 ? 'Connecting...' : refreshProgress < 70 ? 'Checking for new emails...' : refreshProgress < 95 ? 'Loading conversations...' : 'Complete!'}
            </span>
          </div>
        </div>
      )}

      {/* Collapsed View */}
      {isCollapsed ? (
        <div className="flex flex-col h-full items-center py-4">
          <button
            onClick={() => setIsCollapsed(false)}
            className="p-2 hover:bg-accent rounded-md transition-colors mb-4"
            title="Expand conversations"
          >
            <svg className="w-5 h-5 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={() => pollAndRefresh()}
            className="p-2 hover:bg-accent rounded-md transition-colors"
            title="Refresh"
            disabled={loading}
          >
            <span className="text-lg">↻</span>
          </button>
        </div>
      ) : (
        <>
      {/* Workspace Switcher */}
      <WorkspaceSwitcher />

      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCollapsed(true)}
              className="p-1 hover:bg-accent rounded transition-colors"
              title="Collapse sidebar"
            >
              <svg className="w-4 h-4 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-lg font-sans font-semibold text-foreground">Conversations</h2>
              <p className="text-sm font-sans text-muted-foreground mt-1">
                {conversations.length} threads
              </p>
            </div>
          </div>
          <button
            onClick={() => pollAndRefresh()}
            className="px-3 py-1.5 bg-secondary text-secondary-foreground rounded-lg text-xs font-sans font-medium hover:bg-accent transition-colors border border-border"
            title="Check for new emails - Fetches ALL emails from Gmail"
            disabled={loading || refreshing}
          >
            ↻
          </button>
        </div>

        {/* Quick Filter Buttons */}
        <div className="flex flex-wrap gap-2 mb-2">
          <button
            onClick={() => setShowStarred(!showStarred)}
            className={`px-3 py-1.5 rounded-md text-xs font-sans font-semibold transition-all flex items-center gap-1.5 ${
              showStarred
                ? "bg-yellow-500 text-white shadow-sm"
                : "bg-white text-slate-600 border border-slate-300 hover:border-slate-400 hover:bg-slate-50"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            Starred
          </button>
          <button
            onClick={() => setExcludeNonSupport(!excludeNonSupport)}
            className={`px-3 py-1.5 rounded-md text-xs font-sans font-semibold transition-all flex items-center gap-1.5 ${
              excludeNonSupport
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 border border-slate-300 hover:border-slate-400 hover:bg-slate-50"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
            </svg>
            CS Only
          </button>
          <button
            onClick={() => setShowNeedsReply(!showNeedsReply)}
            className={`px-3 py-1.5 rounded-md text-xs font-sans font-semibold transition-all flex items-center gap-1.5 ${
              showNeedsReply
                ? "bg-orange-500 text-white shadow-sm"
                : "bg-white text-slate-600 border border-slate-300 hover:border-slate-400 hover:bg-slate-50"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
            Needs Reply
          </button>
          <button
            onClick={() => setAdminOnly(!adminOnly)}
            className={`px-3 py-1.5 rounded-md text-xs font-sans font-semibold transition-all flex items-center gap-1.5 ${
              adminOnly
                ? "bg-purple-600 text-white shadow-sm"
                : "bg-white text-slate-600 border border-slate-300 hover:border-slate-400 hover:bg-slate-50"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19.5v-15m0 0l-6.75 6.75M12 4.5l6.75 6.75" />
            </svg>
            ADMIN
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-2.5 py-1.5 rounded-md text-xs font-sans font-semibold transition-all flex items-center gap-1.5 ${
              showFilters || selectedTags.length > 0 || statusFilter !== "all" || dateRange !== "all"
                ? "bg-slate-700 text-white shadow-sm"
                : "bg-white text-slate-600 border border-slate-300 hover:border-slate-400 hover:bg-slate-50"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
          </button>
        </div>

        {/* Advanced Filters Panel */}
        {showFilters && (
          <div className="mt-3 p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-4">
            {/* Status Filter */}
            <div>
              <label className="text-xs font-sans font-bold text-slate-700 uppercase tracking-wide mb-2 block">Status</label>
              <div className="grid grid-cols-3 gap-2">
                {(["all", "needs-reply", "resolved"] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-2 rounded-md text-xs font-sans font-semibold transition-all ${
                      statusFilter === status
                        ? "bg-slate-700 text-white shadow-sm"
                        : "bg-white text-slate-600 border border-slate-300 hover:border-slate-400 hover:bg-slate-50"
                    }`}
                  >
                    {status === "all" ? "All" : status === "needs-reply" ? "Needs Reply" : "Resolved"}
                  </button>
                ))}
              </div>
            </div>

            {/* Date Range Filter */}
            <div>
              <label className="text-xs font-sans font-bold text-slate-700 uppercase tracking-wide mb-2 block">Time Period</label>
              <div className="grid grid-cols-4 gap-2">
                {(["all", "today", "week", "month"] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setDateRange(range)}
                    className={`px-2 py-2 rounded-md text-xs font-sans font-semibold transition-all ${
                      dateRange === range
                        ? "bg-slate-700 text-white shadow-sm"
                        : "bg-white text-slate-600 border border-slate-300 hover:border-slate-400 hover:bg-slate-50"
                    }`}
                  >
                    {range === "all" ? "All" : range === "today" ? "Today" : range === "week" ? "Week" : "Month"}
                  </button>
                ))}
              </div>
            </div>

            {/* Tag Filter */}
            {allTags.length > 0 && (
              <div>
                <label className="text-xs font-sans font-bold text-slate-700 uppercase tracking-wide mb-2 block">Custom Tags</label>
                <div className="flex flex-wrap gap-2">
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`px-3 py-1.5 rounded-md text-xs font-sans font-semibold transition-all ${
                        selectedTags.includes(tag)
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-white text-slate-600 border border-slate-300 hover:border-slate-400 hover:bg-slate-50"
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
                className="w-full px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md text-xs font-sans font-semibold transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear All Filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pagination Indicator */}
      {pagination && pagination.total > 0 && (
        <div className="px-4 py-3 border-b border-border bg-secondary/20 relative">
          {pageTransitioning && (
            <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-10">
              <div className="flex items-center gap-2 text-primary">
                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="text-xs font-sans font-medium">Loading...</span>
              </div>
            </div>
          )}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={prevPage}
              disabled={pagination.page === 1 || pageTransitioning}
              className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Previous page"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="flex items-center gap-2 font-sans text-sm">
              <svg className="w-4 h-4 text-foreground/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="font-bold text-foreground text-base">
                {pagination.page}
              </span>
              <span className="text-muted-foreground font-normal">/</span>
              <span className="font-semibold text-foreground text-base">{pagination.totalPages}</span>
            </div>

            <button
              onClick={nextPage}
              disabled={pagination.page === pagination.totalPages || pageTransitioning}
              className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Next page"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-foreground font-sans text-sm">No conversations match filters</p>
          </div>
        ) : (
          conversations.map((conv: Conversation) => (
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
                <span className="text-xs font-sans text-foreground shrink-0">
                  {formatDate(conv.lastMessageAt)}
                </span>
              </div>
              <p className="text-sm font-sans font-medium text-foreground truncate mb-1 ml-7">
                {conv.subject}
              </p>
              <p className="text-sm font-sans text-foreground line-clamp-2 ml-7">
                {getPreview(conv)}
              </p>
              {/* Status Badge */}
              {isUnreplied(conv) && (
                <div className="flex items-center gap-2 mt-2 ml-7">
                  <span className="tag tag-warning font-sans">Needs Reply</span>
                </div>
              )}
              {/* Tags - Separate row, more visible */}
              {/* NEW V2: Display userTags instead of tags (no need to filter system tags) */}
              {conv.userTags && conv.userTags.length > 0 && (
                <div className="flex items-center gap-2 mt-2 ml-7 flex-wrap">
                  {conv.userTags.map((tag) => (
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
      </>
      )}
    </div>
  );
}
