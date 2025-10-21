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

type SyncProgress = {
  stage: string;
  percent: number;
  message: string;
};

type ConversationContextType = {
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  selectConversation: (id: string) => void;
  refreshConversations: () => Promise<void>;
  syncFromGmail: () => Promise<void>;
  loading: boolean;
  syncing: boolean;
  syncProgress: SyncProgress | null;
  lastUpdated: Date | null;
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
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchConversations = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/conversations");
      const data = await res.json();
      setConversations(data);
      if (data.length > 0 && !selectedId) {
        setSelectedId(data[0].id);
      }
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
    } finally {
      setLoading(false);
    }
  };

  const syncFromGmail = async () => {
    // Don't sync if already syncing
    if (syncing) return;

    try {
      setSyncing(true);
      setSyncProgress({ stage: 'syncing', percent: 50, message: 'Syncing...' });

      // Start the background sync
      const response = await fetch("/api/gmail/poll", {
        method: "POST",
      });

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.substring(6));
              if (data.done) {
                // Sync completed, refresh conversations immediately
                await fetchConversations();
                setSyncProgress({ stage: 'complete', percent: 100, message: 'Synced!' });
              } else if (data.stage) {
                setSyncProgress({
                  stage: data.stage,
                  percent: data.percent,
                  message: data.message,
                });
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to sync from Gmail:", error);
      setSyncProgress({ stage: 'error', percent: 0, message: 'Sync failed' });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncProgress(null), 1500); // Clear progress after 1.5s
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
        syncFromGmail,
        loading,
        syncing,
        syncProgress,
        lastUpdated,
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
