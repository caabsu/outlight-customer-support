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
  showArchived: boolean;
  setShowArchived: (show: boolean) => void;
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
  const [showArchived, setShowArchived] = useState(false);

  const fetchConversations = async (silent = false, retryCount = 0) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch("/api/conversations");
      if (!res.ok) {
        // Don't log 500 errors during initial startup (API might not be ready)
        if (retryCount === 0 || res.status !== 500) {
          console.error(`API returned ${res.status}: ${res.statusText}`);
        }
        return;
      }
      const data = await res.json();
      setConversations(data);
      if (data.length > 0 && !selectedId) {
        setSelectedId(data[0].id);
      }
    } catch (error) {
      // Silently handle connection errors during startup
      if (retryCount === 0) {
        // Only log non-connection errors
        if (error instanceof Error && !error.message.includes('Failed to fetch')) {
          console.error("Failed to fetch conversations:", error);
        }
      } else {
        console.error("Failed to fetch conversations:", error);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Initial fetch with delay and retry
  useEffect(() => {
    let retryTimer: NodeJS.Timeout;

    // Small delay to let API server start
    const timer = setTimeout(async () => {
      await fetchConversations(false, 0);
      // If still no data after 2 seconds, retry once
      retryTimer = setTimeout(async () => {
        await fetchConversations(false, 1);
      }, 2000);
    }, 500);

    return () => {
      clearTimeout(timer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  // Auto-refresh every 30 seconds (silent - polls Gmail and refreshes)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        setRefreshing(true);
        // Poll Gmail for new emails
        const pollRes = await fetch("/api/gmail/poll", { method: "POST" });
        if (!pollRes.ok && pollRes.status !== 500) {
          // Silently ignore 500 errors (API might be restarting)
          console.error(`Gmail poll failed: ${pollRes.status}`);
        }
        // Then refresh conversations silently
        await fetchConversations(true, 1);
      } catch (error) {
        // Silently ignore connection errors during refresh
        if (error instanceof Error && !error.message.includes('Failed to fetch')) {
          console.error("Auto-refresh failed:", error);
        }
      } finally {
        setRefreshing(false);
      }
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [selectedId]);

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
      // First, poll Gmail for new emails
      const pollRes = await fetch("/api/gmail/poll", { method: "POST" });
      if (!pollRes.ok && pollRes.status !== 500) {
        console.error(`Gmail poll failed: ${pollRes.status}`);
      }
      // Then refresh conversations from database
      await fetchConversations(true, 1);
    } catch (error) {
      // Silently ignore connection errors
      if (error instanceof Error && !error.message.includes('Failed to fetch')) {
        console.error("Failed to poll and refresh:", error);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const refreshConversations = async () => {
    await fetchConversations(false, 1);
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
        showArchived,
        setShowArchived,
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
