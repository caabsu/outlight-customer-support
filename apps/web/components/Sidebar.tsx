"use client";

import { useState } from "react";
import Link from "next/link";
import { useConversations } from "@/lib/ConversationContext";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUser, useLogout } from "@/components/AuthProvider";

export default function Sidebar() {
  const [activeView, setActiveView] = useState<"inbox" | "sent">("inbox");
  const { showArchived, setShowArchived, showSent, setShowSent, openEmailComposer } = useConversations();
  const pathname = usePathname();
  const currentUser = useCurrentUser();
  const logout = useLogout();
  const router = useRouter();

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
  const isExternalDraftsActive = pathname === "/external-drafts";
  const isQuestionsKBActive = pathname === "/questions";
  const isOnboardingActive = pathname === "/onboarding";

  return (
    <div className="w-full h-full border-r border-border bg-background flex flex-col" style={{ fontFamily: "Roboto, sans-serif" }}>
      {/* Logo/Header */}
      <Link href="/" className="p-6 border-b border-border hover:bg-accent/30 transition-colors cursor-pointer">
        <h1 className="text-2xl font-serif text-foreground">outlight</h1>
        <p className="text-sm font-sans text-muted-foreground mt-1">Customer Support</p>
      </Link>

      {/* Compose Email Button */}
      <div className="p-4 border-b border-border">
        <button
          onClick={() => openEmailComposer()}
          className="w-full px-4 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors text-sm font-sans font-semibold flex items-center justify-center gap-2 shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Compose Email</span>
        </button>
      </div>

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
          <Link
            href="/external-drafts"
            className={`block w-full text-left px-4 py-2.5 rounded-lg text-sm font-sans font-medium transition-colors flex items-center gap-2 ${
              isExternalDraftsActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isExternalDraftsActive ? "bg-blue-500" : "bg-transparent"}`}></span>
            External Drafts
          </Link>
          <Link
            href="/training"
            className={`block w-full text-left px-4 py-2.5 rounded-lg text-sm font-sans font-medium transition-colors flex items-center gap-2 ${
              pathname === "/training"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${pathname === "/training" ? "bg-indigo-500" : "bg-transparent"}`}></span>
            Training & Review
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
          <Link
            href="/questions"
            className={`block w-full text-left px-4 py-2.5 rounded-lg text-sm font-sans font-medium transition-colors flex items-center gap-2 ${
              isQuestionsKBActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isQuestionsKBActive ? "bg-orange-500" : "bg-transparent"}`}></span>
            Questions KB
          </Link>
          <Link
            href="/onboarding"
            className={`block w-full text-left px-4 py-2.5 rounded-lg text-sm font-sans font-medium transition-colors flex items-center gap-2 ${
              isOnboardingActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isOnboardingActive ? "bg-green-500" : "bg-transparent"}`}></span>
            Onboarding
          </Link>
        </div>
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-border">
        {currentUser ? (
          <>
            <button
              onClick={() => router.push(`/analytics/user/${currentUser.id}`)}
              className="w-full flex items-center gap-3 hover:bg-accent/50 rounded-lg p-2 transition-colors group"
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-sans font-medium text-primary">
                  {currentUser.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-sans font-medium text-foreground truncate group-hover:text-primary transition-colors">
                  {currentUser.name}
                </p>
                <p className="text-xs font-sans text-muted-foreground truncate">
                  {currentUser.role}
                </p>
              </div>
            </button>
            <button
              onClick={logout}
              className="w-full mt-2 px-3 py-1.5 text-xs font-sans font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-lg transition-colors"
            >
              Logout
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-sans font-medium text-primary">?</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-sans font-medium text-foreground truncate">Loading...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
