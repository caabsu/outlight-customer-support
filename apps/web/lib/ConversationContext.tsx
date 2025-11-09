"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type Message = {
  id: string;
  fromEmail: string;
  toEmails: string[];
  sentAt: string;
  bodyHtml: string | null;
  bodyText: string | null;
  direction: string;
  replyToEmail: string | null;
};

export type Conversation = {
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

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type Workspace = {
  id: string;
  name: string;
  gmailAccountEmail: string;
  isAuthorized: boolean;
};

type ConversationContextType = {
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  selectConversation: (id: string) => void;
  fetchAndSelectConversation: (id: string) => Promise<void>;
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
  pagination: Pagination | null;
  goToPage: (page: number) => Promise<void>;
  nextPage: () => void;
  prevPage: () => void;
  pageTransitioning: boolean;
  showEmailComposer: boolean;
  openEmailComposer: (to?: string, subject?: string) => void;
  closeEmailComposer: () => void;
  composerTo: string;
  setComposerTo: (to: string) => void;
  composerSubject: string;
  setComposerSubject: (subject: string) => void;
  composerBody: string;
  setComposerBody: (body: string) => void;
  composerAttachments: File[];
  setComposerAttachments: (files: File[]) => void;
  // Filters
  showStarred: boolean;
  setShowStarred: (show: boolean) => void;
  excludeNonSupport: boolean;
  setExcludeNonSupport: (exclude: boolean) => void;
  showNeedsReply: boolean;
  setShowNeedsReply: (show: boolean) => void;
  selectedTags: string[];
  setSelectedTags: (tags: string[]) => void;
  statusFilter: "all" | "needs-reply" | "resolved";
  setStatusFilter: (filter: "all" | "needs-reply" | "resolved") => void;
  dateRange: "all" | "today" | "week" | "month";
  setDateRange: (range: "all" | "today" | "week" | "month") => void;
  adminOnly: boolean;
  setAdminOnly: (show: boolean) => void;
  // Workspace
  currentWorkspaceId: string | null;
  setCurrentWorkspaceId: (id: string) => void;
  workspaces: Workspace[];
  loadWorkspaces: () => Promise<void>;
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
  const [pinnedConversation, setPinnedConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const [showSent, setShowSent] = useState(false);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageTransitioning, setPageTransitioning] = useState(false);

  // Email composer state
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [composerTo, setComposerTo] = useState("");
  const [composerSubject, setComposerSubject] = useState("");
  const [composerBody, setComposerBody] = useState("");
  const [composerAttachments, setComposerAttachments] = useState<File[]>([]);

  // Filter state
  const [showStarred, setShowStarred] = useState(false);
  const [excludeNonSupport, setExcludeNonSupport] = useState(true);
  const [showNeedsReply, setShowNeedsReply] = useState(true);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "needs-reply" | "resolved">("all");
  const [dateRange, setDateRange] = useState<"all" | "today" | "week" | "month">("all");
  const [adminOnly, setAdminOnly] = useState(false);

  // Workspace state
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  const fetchConversations = async (silent = false, retryCount = 0, suppressErrors = false, page = currentPage) => {
    // Don't fetch without a workspace selected
    if (!currentWorkspaceId) {
      if (!silent) setLoading(false);
      return;
    }

    try {
      if (!silent) setLoading(true);

      // Build query params from filter state
      const params = new URLSearchParams();
      params.set('workspaceId', currentWorkspaceId); // REQUIRED: workspace filter
      params.set('page', page.toString());
      params.set('limit', '50');

      if (showArchived) params.set('archived', 'true');
      if (showStarred) params.set('starred', 'true');
      if (excludeNonSupport) params.set('excludeNonSupport', 'true');
      if (showSent) params.set('showSent', 'true');
      if (adminOnly) params.set('adminOnly', 'true');

      // Status filter overrides showNeedsReply
      // Don't apply needsReply or resolved filters if adminOnly is active
      if (!adminOnly) {
        if (statusFilter === 'needs-reply') {
          params.set('needsReply', 'true');
        } else if (statusFilter === 'resolved') {
          params.set('resolved', 'true');
        } else if (showNeedsReply) {
          // Only apply showNeedsReply if statusFilter is 'all'
          params.set('needsReply', 'true');
        }
      }

      if (selectedTags.length > 0) {
        params.set('tags', selectedTags.join(','));
      }

      if (dateRange !== 'all') {
        params.set('dateRange', dateRange);
      }

      const res = await fetch(`/api/conversations?${params.toString()}`);
      if (!res.ok) {
        // Don't log errors if suppressed (during auto-refresh)
        if (!suppressErrors && (retryCount === 0 || res.status !== 500)) {
          console.error(`API returned ${res.status}: ${res.statusText}`);
        }
        setPageTransitioning(false); // Clear transitioning on error
        return;
      }

      // Check if response has content before parsing
      const text = await res.text();
      if (!text || text.trim() === '') {
        if (!suppressErrors) {
          console.error("Empty response from API");
        }
        setPageTransitioning(false); // Clear transitioning on error
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
        setPageTransitioning(false); // Clear transitioning on error
        return;
      }

      // Handle new pagination response format
      let conversationsList = data.conversations || data;
      const paginationData = data.pagination || null;

      // CRITICAL SAFETY CHECK: Aggressively filter conversations client-side as final defense
      // This catches ANY conversations that somehow bypassed backend filters
      const beforeFilter = conversationsList.length;
      conversationsList = conversationsList.filter((conv: Conversation) => {
        // If excludeNonSupport is active, REMOVE any conversation with non-customer-support OR admin tags
        if (excludeNonSupport) {
          if (conv.tags?.includes("non-customer-support")) {
            console.log(`[Client Filter Safety] BLOCKING non-customer-support: ${conv.id} "${conv.subject}"`);
            return false;
          }
          if (conv.tags?.includes("admin") && !adminOnly) {
            console.log(`[Client Filter Safety] BLOCKING admin in default view: ${conv.id} "${conv.subject}"`);
            return false;
          }
        }

        // If adminOnly is active, ONLY show conversations with admin tag
        if (adminOnly && !conv.tags?.includes("admin")) {
          console.log(`[Client Filter Safety] BLOCKING non-admin in admin view: ${conv.id} "${conv.subject}"`);
          return false;
        }

        // If not showing archived, REMOVE archived conversations
        if (!showArchived && conv.archived) {
          console.log(`[Client Filter Safety] BLOCKING archived: ${conv.id} "${conv.subject}"`);
          return false;
        }

        // CRITICAL: If needs-reply filter is active, REMOVE conversations without needs-reply tag
        if (!adminOnly && (showNeedsReply || statusFilter === 'needs-reply')) {
          if (!conv.tags?.includes('needs-reply')) {
            console.log(`[Client Filter Safety] BLOCKING no needs-reply when filter active: ${conv.id} "${conv.subject}"`);
            return false;
          }
        }

        // If resolved filter is active, REMOVE conversations with needs-reply tag
        if (!adminOnly && statusFilter === 'resolved') {
          if (conv.tags?.includes('needs-reply')) {
            console.log(`[Client Filter Safety] BLOCKING needs-reply in resolved view: ${conv.id} "${conv.subject}"`);
            return false;
          }
        }

        return true;
      });

      if (beforeFilter !== conversationsList.length) {
        console.warn(`[Client Filter Safety] 🚨 FILTERED OUT ${beforeFilter - conversationsList.length} conversations that bypassed backend filters!`);
      }

      setConversations(conversationsList);
      setPagination(paginationData);

      // CRITICAL: Always clear pinned conversation if it doesn't match current filters
      // This prevents non-support/archived conversations from staying visible after filtering
      if (pinnedConversation) {
        const updatedPinned = conversationsList.find((c: Conversation) => c.id === pinnedConversation.id);
        if (updatedPinned) {
          // Update pinned with fresh data from server
          setPinnedConversation(updatedPinned);
        } else {
          // Conversation not in filtered list - clear it immediately
          // This happens when conversation is marked as non-support, archived, or no longer matches filters
          console.log('[Filter] Clearing pinned conversation (not in filtered results):', pinnedConversation.id);
          setPinnedConversation(null);
          setSelectedId(null); // Also clear selection to force re-render
        }
      }

      // CRITICAL: Always sync currentPage with API response to prevent navigation bugs
      // This ensures the local state matches what the server returned
      if (paginationData) {
        setCurrentPage(paginationData.page);
      }

      // Only auto-select first conversation on initial load (when no selection exists)
      // Don't auto-select when navigating between pages
      if (conversationsList.length > 0 && !selectedId && conversations.length === 0) {
        setSelectedId(conversationsList[0].id);
      }

      // Clear transitioning state on success
      setPageTransitioning(false);
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
      setPageTransitioning(false); // Clear transitioning on error
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Initial fetch - optimized for instant load
  useEffect(() => {
    let retryTimer: NodeJS.Timeout;
    let mounted = true;

    // Fetch immediately (API server now starts instantly)
    const initialFetch = async () => {
      if (!mounted) return;

      // Try fetching immediately
      await fetchConversations(false, 0, true); // Suppress errors on first attempt

      // Only retry if we have no conversations (API might still be starting)
      if (mounted && conversations.length === 0) {
        retryTimer = setTimeout(async () => {
          if (!mounted) return;
          await fetchConversations(false, 1, false); // Show errors on retry
        }, 500); // Quick retry instead of 3 seconds
      }
    };

    initialFetch();

    return () => {
      mounted = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run once on mount

  // Refetch when any filter changes (reset to page 1)
  useEffect(() => {
    fetchConversations(true, 0, false, 1); // Silent fetch, reset to page 1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived, showSent, showStarred, excludeNonSupport, showNeedsReply, selectedTags, statusFilter, dateRange, adminOnly]);


  // Try to find selected conversation in list, fallback to pinned conversation
  const selectedConversation =
    conversations.find((c) => c.id === selectedId) ||
    (pinnedConversation?.id === selectedId ? pinnedConversation : null);

  const selectConversation = (id: string) => {
    setSelectedId(id);
    // Clear pinned when manually selecting (will be set if needed)
    const found = conversations.find((c) => c.id === id);
    if (found) {
      setPinnedConversation(found);
    }
  };

  const fetchAndSelectConversation = async (id: string) => {
    try {
      // First, check if conversation is already in the list
      const existing = conversations.find((c) => c.id === id);
      if (existing) {
        // Just select it and pin it
        setSelectedId(id);
        setPinnedConversation(existing);
        return;
      }

      // Fetch the conversation from the API
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch conversation: ${res.statusText}`);
      }

      const conversation: Conversation = await res.json();

      // Add it to the conversations list
      setConversations((prev) => [conversation, ...prev]);

      // Pin it so it stays visible even if filters change
      setPinnedConversation(conversation);

      // Select it
      setSelectedId(id);
    } catch (error) {
      console.error("Error fetching conversation:", error);
      throw error;
    }
  };

  const updateConversationOptimistic = (id: string, updates: Partial<Conversation>) => {
    // First, apply the updates
    const updatedConv = conversations.find(c => c.id === id);
    if (!updatedConv) return;

    const newConv = { ...updatedConv, ...updates };

    // Check if updated conversation should be filtered out based on current filters
    const shouldRemove = (() => {
      // Check excludeNonSupport filter
      if (excludeNonSupport && newConv.tags?.includes('non-customer-support')) {
        console.log('[Filter] Removing conversation (non-customer-support):', id);
        return true;
      }

      // Check adminOnly filter
      if (adminOnly && !newConv.tags?.includes('admin')) {
        console.log('[Filter] Removing conversation (not admin):', id);
        return true;
      }

      // Check if it should be hidden from default view (has admin tag but adminOnly is false)
      if (!adminOnly && excludeNonSupport && newConv.tags?.includes('admin')) {
        console.log('[Filter] Removing conversation (admin tag in default view):', id);
        return true;
      }

      // Check archived filter
      if (!showArchived && newConv.archived) {
        console.log('[Filter] Removing conversation (archived):', id);
        return true;
      }

      // CRITICAL: Check needs-reply filter
      // If showing only needs-reply conversations, remove ones without the tag
      if (!adminOnly && (showNeedsReply || statusFilter === 'needs-reply')) {
        if (!newConv.tags?.includes('needs-reply')) {
          console.log('[Filter] Removing conversation (no needs-reply tag when filter active):', id);
          return true;
        }
      }

      // Check resolved filter (opposite of needs-reply)
      if (!adminOnly && statusFilter === 'resolved') {
        if (newConv.tags?.includes('needs-reply')) {
          console.log('[Filter] Removing conversation (has needs-reply in resolved view):', id);
          return true;
        }
      }

      return false;
    })();

    if (shouldRemove) {
      // Remove from list immediately
      setConversations((prev) => prev.filter((conv) => conv.id !== id));

      // Clear pinned and selection if it's the current conversation
      if (pinnedConversation?.id === id) {
        setPinnedConversation(null);
        setSelectedId(null);
      }
    } else {
      // Just update in place
      setConversations((prev) =>
        prev.map((conv) => (conv.id === id ? newConv : conv))
      );

      // Also update pinned conversation if it's the one being updated
      if (pinnedConversation?.id === id) {
        setPinnedConversation(newConv);
      }
    }
  };

  const pollAndRefresh = async () => {
    // Don't poll without a workspace selected
    if (!currentWorkspaceId) return;

    try {
      setRefreshing(true);
      setRefreshProgress(10);

      // First, poll Gmail for new emails (with 10s timeout - backend now uses parallel processing)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout (reduced from 30s)

      try {
        setRefreshProgress(30);
        const pollRes = await fetch(`/api/gmail/poll/workspace/${currentWorkspaceId}`, {
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
      // Then refresh conversations from database - reset to page 1 to see new emails
      await fetchConversations(true, 1, false, 1);
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
    await fetchConversations(false, 1, false); // Preserve current page, don't suppress errors
  };

  const goToPage = async (page: number) => {
    if (page === currentPage) return; // Already on this page

    setPageTransitioning(true);

    try {
      // Use silent mode to prevent full loading screen during page transitions
      // DON'T set currentPage here - let the API response sync it to avoid flickering
      await fetchConversations(true, 0, false, page);
    } catch (error) {
      console.error("Error navigating to page:", error);
      setPageTransitioning(false);
    }
    // Note: pageTransitioning is cleared in fetchConversations (on success or error)
  };

  const nextPage = () => {
    if (pagination && currentPage < pagination.totalPages && !pageTransitioning) {
      goToPage(currentPage + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1 && !pageTransitioning) {
      goToPage(currentPage - 1);
    }
  };

  // Email composer functions
  const openEmailComposer = (to?: string, subject?: string) => {
    setComposerTo(to || "");
    setComposerSubject(subject || "");
    setComposerBody("");
    setComposerAttachments([]);
    setShowEmailComposer(true);
  };

  const closeEmailComposer = () => {
    setShowEmailComposer(false);
  };

  // Workspace functions
  const loadWorkspaces = async () => {
    try {
      console.log('[Workspace] Fetching workspaces from /api/workspaces...');
      const res = await fetch('/api/workspaces');
      if (!res.ok) {
        console.error('[Workspace] Failed to load workspaces:', res.status, res.statusText);
        return;
      }
      const data = await res.json();
      console.log('[Workspace] Received workspaces:', data);
      setWorkspaces(data);

      // Auto-select first workspace if none selected
      if (!currentWorkspaceId && data.length > 0) {
        console.log('[Workspace] Auto-selecting first workspace:', data[0].id, data[0].name);
        setCurrentWorkspaceId(data[0].id);
      } else if (data.length === 0) {
        console.error('[Workspace] NO WORKSPACES FOUND! Database may be empty.');
      }
    } catch (error) {
      console.error('[Workspace] Failed to load workspaces:', error);
    }
  };

  // Load workspaces on mount
  useEffect(() => {
    loadWorkspaces();
  }, []);

  // Refetch conversations when workspace changes
  useEffect(() => {
    if (currentWorkspaceId) {
      fetchConversations(true, 0, false, 1);
    }
  }, [currentWorkspaceId]);

  return (
    <ConversationContext.Provider
      value={{
        conversations,
        selectedConversation,
        selectConversation,
        fetchAndSelectConversation,
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
        pagination,
        goToPage,
        nextPage,
        prevPage,
        pageTransitioning,
        showEmailComposer,
        openEmailComposer,
        closeEmailComposer,
        composerTo,
        setComposerTo,
        composerSubject,
        setComposerSubject,
        composerBody,
        setComposerBody,
        composerAttachments,
        setComposerAttachments,
        // Filters
        showStarred,
        setShowStarred,
        excludeNonSupport,
        setExcludeNonSupport,
        showNeedsReply,
        setShowNeedsReply,
        selectedTags,
        setSelectedTags,
        statusFilter,
        setStatusFilter,
        dateRange,
        setDateRange,
        adminOnly,
        setAdminOnly,
        // Workspace
        currentWorkspaceId,
        setCurrentWorkspaceId,
        workspaces,
        loadWorkspaces,
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
