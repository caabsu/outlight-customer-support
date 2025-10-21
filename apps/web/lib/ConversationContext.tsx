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
};

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
  messages: Message[];
};

type ConversationContextType = {
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  selectConversation: (id: string) => void;
  refreshConversations: () => Promise<void>;
  loading: boolean;
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

  const fetchConversations = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/conversations");
      const data = await res.json();
      setConversations(data);
      if (data.length > 0 && !selectedId) {
        setSelectedId(data[0].id);
      }
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, []);

  const selectedConversation =
    conversations.find((c) => c.id === selectedId) || null;

  const selectConversation = (id: string) => {
    setSelectedId(id);
  };

  return (
    <ConversationContext.Provider
      value={{
        conversations,
        selectedConversation,
        selectConversation,
        refreshConversations: fetchConversations,
        loading,
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
