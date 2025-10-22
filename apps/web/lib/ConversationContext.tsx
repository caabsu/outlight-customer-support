"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

type Message = {
  id: string;
  fromEmail: string;
  toEmails: string[];
  sentAt: string;
  bodyHtml: string | null;
  bodyText: string | null;
  direction: string;
  replyToEmail: string | null;
};

type Conversation = {
  id: string;
  subject: string;
  customerId: string;
  status: string;
  lastMessageAt: string;
  unreadAgent: boolean;
  starred?: boolean;
  archived?: boolean;
  tags?: string[];
  customer: {
    name: string | null;
    primaryEmail: string;
  };
  messages: Message[];
};

type ConversationContextType = {
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  selectConversation: (id: string) => void;
  refreshConversations: () => Promise<void>;
  pollAndRefresh: () => Promise<void>;
  updateConversationOptimistic: (id: string, updates: Partial<Conversation>) => void;
  loading: boolean;
  refreshing: boolean;
  refreshProgress: number;
  showArchived: boolean;
  setShowArchived: (show: boolean) => void;
  showSent: boolean;
  setShowSent: (show: boolean) => void;
};

const ConversationContext = createContext<ConversationContextType | undefined>(
  undefined
);

export function ConversationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const [showSent, setShowSent] = useState(false);

  const fetchConversations = async (silent = false, retryCount = 0, suppressErrors = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch("/api/conversations");
      if (!res.ok) {
        // Don't log errors if suppressed (during auto-refresh)
        if (!suppressErrors && (retryCount === 0 || res.status !== 500)) {
          console.error(`API returned ${res.status}: ${res.statusText}`);
        }
        return;
      }

      // Check if response has content before parsing
      const text = await res.text();
      if (!text || text.trim() === '') {
        if (!suppressErrors) {
          console.error("Empty response from API");
        }
        return;
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        if (!suppressErrors) {
          console.error("Failed to parse JSON response:", parseError);
          console.error("Response text:", text.substring(0, 200));
        }
        return;
      }

      setConversations(data);
      if (data.length > 0 && !selectedId) {
        setSelectedId(data[0].id);
      }
    } catch (error) {
      // Only log if not suppressed
      if (!suppressErrors) {
        // Silently handle connection errors during startup
        if (retryCount === 0) {
          // Only log non-connection errors
          if (error instanceof Error && !error.message.includes('Failed to fetch')) {
            console.error("Failed to fetch conversations:", error);
          }
        } else {
          console.error("Failed to fetch conversations:", error);
        }
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Initial fetch with delay and retry
  useEffect(() => {
    let retryTimer: NodeJS.Timeout;
    let mounted = true;

    // Small delay to let API server start
    const timer = setTimeout(async () => {
      if (!mounted) return;
      await fetchConversations(false, 0, false); // Don't suppress initial errors

      // If still no data after 2 seconds, retry once
      retryTimer = setTimeout(async () => {
        if (!mounted) return;
        await fetchConversations(false, 1, false); // Don't suppress retry errors

        // Force loading to false after final retry
        setTimeout(() => {
          if (mounted) setLoading(false);
        }, 1000);
      }, 2000);
    }, 500);

    return () => {
      mounted = false;
      clearTimeout(timer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);


  const selectedConversation =
    conversations.find((c) => c.id === selectedId) || null;

  const selectConversation = (id: string) => {
    setSelectedId(id);
  };

  const updateConversationOptimistic = (id: string, updates: Partial<Conversation>) => {
    setConversations((prev) =>
      prev.map((conv) => (conv.id === id ? { ...conv, ...updates } : conv))
    );
  };

  const pollAndRefresh = async () => {
    try {
      setRefreshing(true);
      setRefreshProgress(10);

      // First, poll Gmail for new emails (with 10s timeout - backend now uses parallel processing)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout (reduced from 30s)

      try {
        setRefreshProgress(30);
        const pollRes = await fetch("/api/gmail/poll", {
          method: "POST",
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        setRefreshProgress(70);

        if (!pollRes.ok && pollRes.status !== 500) {
          console.error(`Gmail poll failed: ${pollRes.status}`);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === 'AbortError') {
          console.error("Gmail poll timed out after 10 seconds - check backend performance");
        }
        // Don't re-throw, just continue to refresh conversations
      }

      setRefreshProgress(90);
      // Then refresh conversations from database (don't suppress errors for manual refresh)
      await fetchConversations(true, 1, false);
      setRefreshProgress(100);
    } catch (error) {
      // Silently ignore connection errors
      if (error instanceof Error && !error.message.includes('Failed to fetch')) {
        console.error("Failed to poll and refresh:", error);
      }
    } finally {
      // Small delay to show 100% before hiding
      setTimeout(() => {
        setRefreshing(false);
        setRefreshProgress(0);
      }, 300);
    }
  };

  const refreshConversations = async () => {
    await fetchConversations(false, 1, false); // Don't suppress errors for manual refresh
  };

  return (
    <ConversationContext.Provider
      value={{
        conversations,
        selectedConversation,
        selectConversation,
        refreshConversations,
        pollAndRefresh,
        updateConversationOptimistic,
        loading,
        refreshing,
        refreshProgress,
        showArchived,
        setShowArchived,
        showSent,
        setShowSent,
      }}
    >
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversations() {
  const context = useContext(ConversationContext);
  if (context === undefined) {
    throw new Error(
      "useConversations must be used within a ConversationProvider"
    );
  }
  return context;
}
