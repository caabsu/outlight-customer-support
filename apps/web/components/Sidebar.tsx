"use client";

import { useState } from "react";
import Link from "next/link";
import { useConversations } from "@/lib/ConversationContext";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const [activeView, setActiveView] = useState<"inbox" | "sent">("inbox");
  const { showArchived, setShowArchived, showSent, setShowSent } = useConversations();
  const pathname = usePathname();

  const handleViewChange = (view: "inbox" | "sent" | "archived") => {
    if (view === "archived") {
      setShowArchived(true);
      setShowSent(false);
      setActiveView("inbox");
    } else if (view === "sent") {
      setShowArchived(false);
      setShowSent(true);
      setActiveView("sent");
    } else {
      setShowArchived(false);
      setShowSent(false);
      setActiveView(view);
    }
  };

  const isAnalyticsActive = pathname === "/analytics";
  const isKnowledgeBaseActive = pathname === "/knowledge-base";

  return (
    <div className="w-64 border-r border-border bg-background flex flex-col" style={{ fontFamily: "Roboto, sans-serif" }}>
      {/* Logo/Header */}
      <Link href="/" className="p-6 border-b border-border hover:bg-accent/30 transition-colors cursor-pointer">
        <h1 className="text-2xl font-serif text-foreground">outlight</h1>
        <p className="text-sm font-sans text-muted-foreground mt-1">Customer Support</p>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {/* Email Section */}
        <div className="mb-4">
          <div className="px-4 py-2 mb-2">
            <h3 className="text-xs font-sans font-semibold text-muted-foreground uppercase tracking-wider">Email</h3>
          </div>
          <button
            onClick={() => handleViewChange("inbox")}
            className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-sans font-medium transition-colors flex items-center gap-2 ${
              activeView === "inbox" && !showArchived
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${activeView === "inbox" && !showArchived ? "bg-primary" : "bg-transparent"}`}></span>
            Inbox
          </button>
          <button
            onClick={() => handleViewChange("sent")}
            className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-sans font-medium transition-colors flex items-center gap-2 ${
              activeView === "sent" && !showArchived
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${activeView === "sent" && !showArchived ? "bg-success" : "bg-transparent"}`}></span>
            Sent
          </button>
          <button
            onClick={() => handleViewChange("archived")}
            className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-sans font-medium transition-colors flex items-center gap-2 ${
              showArchived
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${showArchived ? "bg-muted-foreground" : "bg-transparent"}`}></span>
            Archived
          </button>
        </div>

        {/* Insights Section */}
        <div className="pt-4 border-t border-border">
          <div className="px-4 py-2 mb-2">
            <h3 className="text-xs font-sans font-semibold text-muted-foreground uppercase tracking-wider">Insights</h3>
          </div>
          <Link
            href="/analytics"
            className={`block w-full text-left px-4 py-2.5 rounded-lg text-sm font-sans font-medium transition-colors flex items-center gap-2 ${
              isAnalyticsActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isAnalyticsActive ? "bg-warning" : "bg-transparent"}`}></span>
            Analytics
          </Link>
        </div>

        {/* Settings Section */}
        <div className="pt-4 border-t border-border">
          <div className="px-4 py-2 mb-2">
            <h3 className="text-xs font-sans font-semibold text-muted-foreground uppercase tracking-wider">Settings</h3>
          </div>
          <Link
            href="/knowledge-base"
            className={`block w-full text-left px-4 py-2.5 rounded-lg text-sm font-sans font-medium transition-colors flex items-center gap-2 ${
              isKnowledgeBaseActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isKnowledgeBaseActive ? "bg-purple-500" : "bg-transparent"}`}></span>
            Knowledge Base
          </Link>
        </div>
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-sans font-medium text-primary">U</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-sans font-medium text-foreground truncate">User</p>
            <p className="text-xs font-sans text-muted-foreground truncate">user@outlight.com</p>
          </div>
        </div>
      </div>
    </div>
  );
}
