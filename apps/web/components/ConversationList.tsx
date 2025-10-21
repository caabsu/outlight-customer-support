"use client";

import { useConversations } from "@/lib/ConversationContext";

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
  const { conversations, selectedConversation, selectConversation, loading } =
    useConversations();

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
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="w-96 border-r border-border bg-background flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">Conversations</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {conversations.length} threads
        </p>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground text-sm">No conversations yet</p>
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
                  <p className="text-sm font-medium text-foreground truncate">
                    {conv.customer.name || conv.customer.primaryEmail}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatDate(conv.lastMessageAt)}
                </span>
              </div>
              <p className="text-sm font-medium text-foreground truncate mb-1">
                {conv.subject}
              </p>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {getPreview(conv)}
              </p>
              {conv.unreadAgent && (
                <div className="mt-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
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
