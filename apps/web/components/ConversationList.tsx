"use client";

import { useConversations } from "@/lib/ConversationContext";
import { useState, useEffect } from "react";

type Conversation = {
  id: string;
  subject: string;
  customerId: string;
  status: string;
  lastMessageAt: string;
  unreadAgent: boolean;
  customer: {
    name: string | null;
    primaryEmail: string;
  };
  messages: {
    bodyText: string | null;
    fromEmail: string;
  }[];
};

export default function ConversationList() {
  const {
    conversations,
    selectedConversation,
    selectConversation,
    loading,
    syncing,
    syncProgress,
    syncFromGmail,
    lastUpdated,
  } = useConversations();

  const [timeAgo, setTimeAgo] = useState<string>("");

  // Update "time ago" every minute
  useEffect(() => {
    const updateTimeAgo = () => {
      if (!lastUpdated) {
        setTimeAgo("");
        return;
      }

      const now = new Date();
      const diffMs = now.getTime() - lastUpdated.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);

      if (diffMins < 1) {
        setTimeAgo("Just now");
      } else if (diffMins < 60) {
        setTimeAgo(`${diffMins} min${diffMins > 1 ? 's' : ''} ago`);
      } else {
        setTimeAgo(`${diffHours} hour${diffHours > 1 ? 's' : ''} ago`);
      }
    };

    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [lastUpdated]);

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

  if (loading) {
    return (
      <div className="w-96 border-r border-border bg-background flex items-center justify-center">
        <p className="text-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="w-96 border-r border-border bg-background flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-foreground">Conversations</h2>
          <button
            onClick={syncFromGmail}
            disabled={syncing || loading}
            className="p-2 hover:bg-accent rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh from Gmail"
          >
            <svg
              className={`w-4 h-4 text-foreground ${syncing ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-foreground">
            {conversations.length} threads
          </p>
          {timeAgo && (
            <p className="text-foreground">
              Updated {timeAgo}
            </p>
          )}
        </div>
        {syncProgress && syncProgress.stage !== 'complete' && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-foreground">
                {syncProgress.message}
              </span>
              <span className="text-foreground font-mono">
                {syncProgress.percent}%
              </span>
            </div>
            <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200 ease-out"
                style={{ width: `${syncProgress.percent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-foreground">No conversations yet</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => selectConversation(conv.id)}
              className={`w-full text-left p-4 border-b border-border transition-colors ${
                selectedConversation?.id === conv.id
                  ? "bg-accent"
                  : "hover:bg-accent/50"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">
                    {conv.customer.name || conv.customer.primaryEmail}
                  </p>
                </div>
                <span className="text-foreground shrink-0">
                  {formatDate(conv.lastMessageAt)}
                </span>
              </div>
              <p className="font-medium text-foreground truncate mb-1">
                {conv.subject}
              </p>
              <p className="text-foreground line-clamp-2">
                {getPreview(conv)}
              </p>
              {conv.unreadAgent && (
                <div className="mt-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded font-medium bg-primary/10 text-primary">
                    Unread
                  </span>
                </div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
