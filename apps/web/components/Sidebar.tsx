"use client";

import { useState } from "react";
import Link from "next/link";
import { useConversations } from "@/lib/ConversationContext";

export default function Sidebar() {
  const [activeView, setActiveView] = useState<"inbox" | "sent">("inbox");
  const { showArchived, setShowArchived } = useConversations();

  const handleViewChange = (view: "inbox" | "sent" | "archived") => {
    if (view === "archived") {
      setShowArchived(true);
      setActiveView("inbox");
    } else {
      setShowArchived(false);
      setActiveView(view);
    }
  };

  return (
    <div className="w-64 border-r border-border bg-background flex flex-col">
      {/* Logo/Header */}
      <Link href="/" className="p-6 border-b border-border hover:bg-accent/30 transition-colors cursor-pointer">
        <h1 className="text-xl font-semibold text-foreground">Outlight</h1>
        <p className="text-sm text-muted-foreground mt-1">Support</p>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        <button
          onClick={() => handleViewChange("inbox")}
          className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            activeView === "inbox" && !showArchived
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          }`}
        >
          Inbox
        </button>
        <button
          onClick={() => handleViewChange("sent")}
          className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            activeView === "sent" && !showArchived
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          }`}
        >
          Sent
        </button>
        <button
          onClick={() => handleViewChange("archived")}
          className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            showArchived
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          }`}
        >
          Archived
        </button>
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-medium text-primary">U</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">User</p>
            <p className="text-xs text-muted-foreground truncate">user@outlight.com</p>
          </div>
        </div>
      </div>
    </div>
  );
}
