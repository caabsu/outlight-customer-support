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
  updateConversationOptimistic: (id: string, updates: Partial<Conversation>) => void;
  loading: boolean;
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
  const [showArchived, setShowArchived] = useState(false);

  const fetchConversations = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch("/api/conversations");
      const data = await res.json();
      setConversations(data);
      if (data.length > 0 && !selectedId) {
        setSelectedId(data[0].id);
      }
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchConversations();
  }, []);

  // Auto-refresh every 30 seconds (silent - no loading indicator)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations(true);
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

  return (
    <ConversationContext.Provider
      value={{
        conversations,
        selectedConversation,
        selectConversation,
        refreshConversations: fetchConversations,
        updateConversationOptimistic,
        loading,
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
