"use client";

import { useState, useEffect, useRef } from "react";
import { useConversations } from "@/lib/ConversationContext";
import { useRouter } from "next/navigation";

type ConversationHistory = {
  id: string;
  subject: string;
  lastMessageAt: string;
  archived?: boolean;
  tags?: string[];
  messages: { direction: string; bodyText?: string | null; bodyHtml?: string | null }[];
};

// Helper function to escape HTML special characters
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Convert plain text to Gmail-compatible HTML
function textToGmailHtml(text: string): string {
  return text
    .split('\n')
    .map(line => {
      // Escape HTML special characters in the line
      const escapedLine = escapeHtml(line);
      // Empty lines need a <br> to preserve spacing
      return `<div>${escapedLine || '<br>'}</div>`;
    })
    .join('');
}

// Sanitize email HTML while preserving Gmail-like display
function sanitizeEmailHtml(html: string): string {
  if (!html) return html;

  let sanitized = html;

  // Remove only <style> tags (external CSS can break layout)
  sanitized = sanitized.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Remove class attributes (they reference removed styles)
  sanitized = sanitized.replace(/\sclass\s*=\s*"[^"]*"/gi, '');
  sanitized = sanitized.replace(/\sclass\s*=\s*'[^']*'/gi, '');

  // Gmail-like approach: Keep inline styles but override problematic ones with CSS
  // Don't remove inline styles - they contain important formatting like text-align, color, etc.

  // Wrap with CSS that constrains width while preserving original formatting
  return `<div class="gmail-email-body" style="width: 100%; overflow: hidden;">
    <style>
      /* Constrain tables to container width */
      .email-html-container .gmail-email-body table {
        max-width: 100% !important;
        box-sizing: border-box !important;
      }

      /* Make images responsive */
      .email-html-container .gmail-email-body img {
        max-width: 100% !important;
        height: auto !important;
        box-sizing: border-box !important;
      }

      /* Constrain any element with explicit width */
      .email-html-container .gmail-email-body div[style*="width"],
      .email-html-container .gmail-email-body table[style*="width"] {
        max-width: 100% !important;
        box-sizing: border-box !important;
      }

      /* Allow text to wrap naturally */
      .email-html-container .gmail-email-body td,
      .email-html-container .gmail-email-body th,
      .email-html-container .gmail-email-body p,
      .email-html-container .gmail-email-body div {
        word-wrap: break-word !important;
        overflow-wrap: break-word !important;
      }

      /* Break long URLs but preserve normal text breaking */
      .email-html-container .gmail-email-body a {
        word-break: break-word !important;
      }

      /* Prevent horizontal overflow */
      .email-html-container .gmail-email-body * {
        box-sizing: border-box !important;
      }
    </style>
    ${sanitized}
  </div>`;
}

export default function ConversationView() {
  const {
    conversations,
    selectedConversation,
    selectConversation,
    fetchAndSelectConversation,
    refreshConversations,
    updateConversationOptimistic,
    pagination,
    goToPage,
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
    showArchived,
    setShowArchived,
    // Filters
    showStarred,
    excludeNonSupport,
    showNeedsReply,
    selectedTags,
    statusFilter,
    dateRange,
    showSent
  } = useConversations();
  const router = useRouter();
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const replyEditorRef = useRef<HTMLDivElement>(null);
  const composerBodyRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<ConversationHistory[]>([]);
  const [showHistory, setShowHistory] = useState(true);
  const [editingTags, setEditingTags] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [summaryMinimized, setSummaryMinimized] = useState(false);
  const [expandedPreviews, setExpandedPreviews] = useState<Set<string>>(new Set());
  const [activeInfoTooltip, setActiveInfoTooltip] = useState<string | null>(null);
  const [navigatingUnreplied, setNavigatingUnreplied] = useState(false);
  const [showNeedsReplyOnly, setShowNeedsReplyOnly] = useState(false); // Default to showing all conversations

  // Shopify state
  const [shopifyCustomer, setShopifyCustomer] = useState<any>(null);
  const [shopifyOrders, setShopifyOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [loadingShopify, setLoadingShopify] = useState(false);
  const [shopifyError, setShopifyError] = useState<string | null>(null);
  const [copiedTrackingNumber, setCopiedTrackingNumber] = useState<string | null>(null);
  const [shopifySearchQuery, setShopifySearchQuery] = useState("");
  const [searchingShopify, setSearchingShopify] = useState(false);
  const [detectingEmail, setDetectingEmail] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Refund state
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundOrder, setRefundOrder] = useState<any>(null);
  const [refundMode, setRefundMode] = useState<'simple' | 'items'>('simple');
  const [refundType, setRefundType] = useState<'preset' | 'percentage' | 'dollar' | 'full'>('preset');
  const [refundPreset, setRefundPreset] = useState<80 | 50>(80);
  const [refundCustomPercentage, setRefundCustomPercentage] = useState("");
  const [refundCustomDollar, setRefundCustomDollar] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundNotifyCustomer, setRefundNotifyCustomer] = useState(true);
  const [refundRestock, setRefundRestock] = useState(false);
  const [processingRefund, setProcessingRefund] = useState(false);
  const [refundConfirmation, setRefundConfirmation] = useState(false);
  const [selectedLineItems, setSelectedLineItems] = useState<Map<number, { quantity: number; restock: boolean }>>(new Map());

  // 17track state
  const [trackingData, setTrackingData] = useState<any>(null);
  const [loadingTracking, setLoadingTracking] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [showTrackingModal, setShowTrackingModal] = useState(false);

  // AI Draft state - stored per conversation ID
  const [draftsByConversationId, setDraftsByConversationId] = useState<Record<string, any>>({});
  const [loadingDraftByConversationId, setLoadingDraftByConversationId] = useState<Record<string, boolean>>({});
  const [draftError, setDraftError] = useState<string | null>(null);
  const [showDraftPopup, setShowDraftPopup] = useState(false);
  const [draftMinimized, setDraftMinimized] = useState(false);
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);
  const [showKBTab, setShowKBTab] = useState(false); // For Draft KB tab
  const [showSummarizeKBTab, setShowSummarizeKBTab] = useState(false); // For Summarize KB tab
  const [expandedKBSections, setExpandedKBSections] = useState<Record<string, boolean>>({
    general: true,
    toolSpecific: true
  });
  const [editingDraft, setEditingDraft] = useState(false);
  const [editedDraftText, setEditedDraftText] = useState("");

  // Sidebar resize state
  const [rightSidebarWidth, setRightSidebarWidth] = useState(320); // 320px = 20rem = w-80

  // Get current conversation's draft and loading state
  const draftData = selectedConversation?.id ? draftsByConversationId[selectedConversation.id] : null;
  const loadingDraft = selectedConversation?.id ? loadingDraftByConversationId[selectedConversation.id] || false : false;

  // Track which conversations we've already attempted to auto-load drafts for
  const autoLoadAttemptedRef = useRef<Set<string>>(new Set());

  // Helper function to check if conversation needs reply
  // Uses hybrid approach: check tag first (new system), then fall back to message direction (old system)
  const isUnreplied = (conv: ConversationHistory) => {
    // First check if has needs-reply tag (new system)
    if (conv.tags?.includes("needs-reply")) {
      return true;
    }

    // Fallback to last message direction check (for conversations without tags yet)
    if (!conv.messages || conv.messages.length === 0) return false;
    const lastMessage = conv.messages[conv.messages.length - 1];
    return lastMessage.direction === "inbound";
  };

  // Helper function to build query params with current filters
  const buildFilterParams = (page: number, limit: number = 50): string => {
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('limit', limit.toString());

    if (showArchived) params.set('archived', 'true');
    if (showStarred) params.set('starred', 'true');
    if (excludeNonSupport) params.set('excludeNonSupport', 'true');
    if (showSent) params.set('showSent', 'true');

    // Status filter overrides showNeedsReply
    if (statusFilter === 'needs-reply') {
      params.set('needsReply', 'true');
    } else if (statusFilter === 'resolved') {
      params.set('resolved', 'true');
    } else if (showNeedsReply) {
      // Only apply showNeedsReply if statusFilter is 'all'
      params.set('needsReply', 'true');
    }

    if (selectedTags.length > 0) {
      params.set('tags', selectedTags.join(','));
    }

    if (dateRange !== 'all') {
      params.set('dateRange', dateRange);
    }

    return params.toString();
  };

  // Filter history based on needs-reply filter
  const filteredHistory = showNeedsReplyOnly
    ? history.filter(conv => isUnreplied(conv))
    : history;

  // Fetch conversation history
  useEffect(() => {
    if (selectedConversation?.id) {
      setLoadingHistory(true);
      setHistory([]);
      fetch(`/api/conversations/${selectedConversation.id}/history`)
        .then((res) => res.json())
        .then((data) => {
          setHistory(data);
          setLoadingHistory(false);
        })
        .catch((err) => {
          console.error("Failed to fetch history:", err);
          setLoadingHistory(false);
        });
    } else {
      setHistory([]);
      setLoadingHistory(false);
    }
  }, [selectedConversation?.id]);

  // Reset draft popup state when conversation changes
  useEffect(() => {
    // Close popup and KB tab when switching conversations
    setShowDraftPopup(false);
    setDraftMinimized(false);
    setShowKBTab(false);
    setShowSummarizeKBTab(false);
    setDraftError(null);
  }, [selectedConversation?.id]);

  // Auto-load existing draft from database when conversation is selected
  useEffect(() => {
    if (!selectedConversation?.id) return;

    // Check if we already have the draft in state
    if (draftsByConversationId[selectedConversation.id]) return;

    // Don't auto-load if draft is currently being generated
    if (loadingDraftByConversationId[selectedConversation.id]) return;

    // Check if we've already attempted to auto-load this conversation
    if (autoLoadAttemptedRef.current.has(selectedConversation.id)) return;

    // Mark this conversation as attempted
    autoLoadAttemptedRef.current.add(selectedConversation.id);

    // Fetch draft from database
    const apiUrl = process.env.NODE_ENV === 'development'
      ? `http://localhost:3001/conversations/${selectedConversation.id}/draft`
      : `/api/conversations/${selectedConversation.id}/draft`;

    fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forceRegenerate: false })
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch draft");
        return res.json();
      })
      .then((data) => {
        // Only save to state if this is a cached draft from database
        if (data.fromDatabase) {
          setDraftsByConversationId(prev => ({
            ...prev,
            [selectedConversation.id]: data
          }));
        }
      })
      .catch((err) => {
        // Silently fail - draft might not exist yet, which is fine
        console.log(`No existing draft for conversation ${selectedConversation.id}`);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversation?.id]);

  // Fetch Shopify customer data
  useEffect(() => {
    if (selectedConversation?.customer?.primaryEmail) {
      setLoadingShopify(true);
      setShopifyError(null);
      setShopifyCustomer(null);
      setShopifyOrders([]);
      setSelectedOrder(null);

      fetch(`/api/shopify/customer?email=${encodeURIComponent(selectedConversation.customer.primaryEmail)}`)
        .then((res) => {
          if (res.status === 404) {
            setShopifyError("Customer not found in Shopify");
            setLoadingShopify(false);
            return null;
          }
          if (!res.ok) {
            throw new Error("Failed to fetch customer");
          }
          return res.json();
        })
        .then((customer) => {
          if (customer) {
            setShopifyCustomer(customer);
            // Fetch customer orders
            return fetch(`/api/shopify/customer/${customer.id}/orders`);
          }
          return null;
        })
        .then((res) => {
          if (res) {
            return res.json();
          }
          return null;
        })
        .then((orders) => {
          if (orders) {
            setShopifyOrders(orders);
          }
          setLoadingShopify(false);
        })
        .catch((err) => {
          console.error("Failed to fetch Shopify data:", err);
          setShopifyError("Failed to load Shopify data");
          setLoadingShopify(false);
        });
    } else {
      setShopifyCustomer(null);
      setShopifyOrders([]);
      setSelectedOrder(null);
      setLoadingShopify(false);
    }
  }, [selectedConversation?.customer?.primaryEmail]);

  // Manual AI summary generation
  const handleGenerateSummary = async () => {
    if (!selectedConversation?.id) return;

    setLoadingSummary(true);
    setAiSummary(null);
    try {
      const res = await fetch(`/api/conversations/${selectedConversation.id}/summary`, {
        method: "POST"
      });
      const data = await res.json();
      setAiSummary(data.summary);
    } catch (err) {
      console.error("Failed to fetch summary:", err);
    } finally {
      setLoadingSummary(false);
    }
  };

  // Get the correct reply-to email
  const getReplyToEmail = () => {
    if (!selectedConversation) return "";

    // Find the most recent inbound message
    const inboundMessages = selectedConversation.messages.filter(
      (m) => m.direction === "inbound"
    );

    if (inboundMessages.length > 0) {
      const lastInbound = inboundMessages[inboundMessages.length - 1];
      // Use Reply-To if it exists, otherwise fall back to fromEmail
      return lastInbound.replyToEmail || lastInbound.fromEmail;
    }

    return selectedConversation.customer.primaryEmail;
  };

  const handleSend = async () => {
    // Get text content from contentEditable div
    const textContent = replyEditorRef.current?.textContent || "";

    if (!textContent.trim() || !selectedConversation) return;

    // Convert plain text to Gmail-compatible HTML
    const htmlContent = textToGmailHtml(textContent);

    setSending(true);
    try {
      const recipientEmail = getReplyToEmail();

      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          to: recipientEmail,
          body: htmlContent,
        }),
      });

      // Check if the request was successful
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      // Only clear the text if send was successful
      if (replyEditorRef.current) {
        replyEditorRef.current.innerHTML = "";
      }
      setReplyText("");

      // Clear draft data when email is sent
      if (selectedConversation?.id) {
        setDraftsByConversationId(prev => {
          const newDrafts = { ...prev };
          delete newDrafts[selectedConversation.id];
          return newDrafts;
        });
      }
      setShowDraftPopup(false);
      setDraftMinimized(false);
      setDraftError(null);

      // Save the current conversation ID to re-select it after refresh
      const currentConversationId = selectedConversation?.id;

      // Refresh conversations to show the new message
      await refreshConversations();

      // Re-select the conversation to keep it visible (using fetchAndSelectConversation to pin it)
      if (currentConversationId) {
        await fetchAndSelectConversation(currentConversationId);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      // Show error to user
      alert(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`);
    } finally {
      setSending(false);
    }
  };

  const handleMarkNonSupport = async () => {
    if (!selectedConversation) return;

    const currentTags = selectedConversation.tags || [];
    const updatedTags = [...currentTags, "non-customer-support"];

    // Optimistic update - instant UI feedback
    updateConversationOptimistic(selectedConversation.id, {
      tags: updatedTags
    });

    try {
      // Update tags
      await fetch(`/api/conversations/${selectedConversation.id}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: updatedTags }),
      });
      await refreshConversations();
    } catch (error) {
      console.error("Failed to mark as non-support:", error);
      // Revert on error
      updateConversationOptimistic(selectedConversation.id, {
        tags: currentTags
      });
    }
  };

  const handleMarkResolved = async () => {
    if (!selectedConversation) return;

    // Optimistic update - instant UI feedback
    updateConversationOptimistic(selectedConversation.id, {
      archived: true
    });

    try {
      await fetch(`/api/conversations/${selectedConversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      await refreshConversations();
    } catch (error) {
      console.error("Failed to mark as resolved:", error);
      // Revert on error
      updateConversationOptimistic(selectedConversation.id, {
        archived: false
      });
    }
  };

  const goToNextUnreplied = async () => {
    if (navigatingUnreplied) return; // Prevent multiple clicks

    try {
      // STEP 1: Check current page FIRST (instant, no API call!)
      const unrepliedOnPage = conversations.filter((conv) => {
        if (conv.tags?.includes("non-customer-support")) return false;
        if (conv.messages.length === 0) return false;
        const lastMessage = conv.messages[conv.messages.length - 1];
        return lastMessage.direction === "inbound";
      });

      const sortedUnreplied = unrepliedOnPage.sort((a, b) =>
        new Date(a.lastMessageAt).getTime() - new Date(b.lastMessageAt).getTime()
      );

      if (selectedConversation) {
        // Find current conversation in the sorted list
        const currentIndex = sortedUnreplied.findIndex(conv => conv.id === selectedConversation.id);

        // If there's a next unreplied on this page, select it INSTANTLY
        if (currentIndex >= 0 && currentIndex < sortedUnreplied.length - 1) {
          selectConversation(sortedUnreplied[currentIndex + 1].id);
          return; // ⚡ INSTANT - no API call!
        }
      } else if (sortedUnreplied.length > 0) {
        // No conversation selected - select first unreplied on page
        selectConversation(sortedUnreplied[0].id);
        return; // ⚡ INSTANT
      }

      // STEP 2: No next unreplied on current page - search other pages (API call)
      setNavigatingUnreplied(true);

      const response = await fetch(`/api/conversations/next-unreplied/${selectedConversation?.id || ''}`);

      if (!response.ok) {
        console.error("Failed to fetch next unreplied");
        setNavigatingUnreplied(false);
        return;
      }

      const nextConversation = await response.json();

      if (!nextConversation || !nextConversation.id) {
        alert("No more unreplied emails!");
        setNavigatingUnreplied(false);
        return;
      }

      // Double-check if on current page (safety fallback)
      const isOnCurrentPage = conversations.some(conv => conv.id === nextConversation.id);

      if (isOnCurrentPage) {
        selectConversation(nextConversation.id);
        setNavigatingUnreplied(false);
      } else if (pagination) {
        // Cross-page navigation - NOW show loading
        setNavigatingUnreplied(true);
        // Need to find which page has this conversation
        // Optimize: check current page's date range to determine search direction
        const nextConvDate = new Date(nextConversation.lastMessageAt).getTime();
        const currentPageOldest = new Date(conversations[conversations.length - 1]?.lastMessageAt || 0).getTime();
        const currentPageNewest = new Date(conversations[0]?.lastMessageAt || 0).getTime();

        let foundPage = 0;

        // Smart search: if next conversation is older than current page, search forward (later pages)
        // If newer, search backward (earlier pages)
        if (nextConvDate < currentPageOldest) {
          // Search forward through later pages
          for (let page = pagination.page + 1; page <= pagination.totalPages; page++) {
            const res = await fetch(`/api/conversations?${buildFilterParams(page)}`);
            if (res.ok) {
              const data = await res.json();
              const convs = data.conversations || data;
              if (convs.some((c: any) => c.id === nextConversation.id)) {
                foundPage = page;
                break;
              }
            }
          }
        } else if (nextConvDate > currentPageNewest) {
          // Search backward through earlier pages
          for (let page = pagination.page - 1; page >= 1; page--) {
            const res = await fetch(`/api/conversations?${buildFilterParams(page)}`);
            if (res.ok) {
              const data = await res.json();
              const convs = data.conversations || data;
              if (convs.some((c: any) => c.id === nextConversation.id)) {
                foundPage = page;
                break;
              }
            }
          }
        }

        // If not found in smart search, do full search as fallback
        if (foundPage === 0) {
          for (let page = 1; page <= pagination.totalPages; page++) {
            if (page === pagination.page) continue; // Skip current page (already checked)
            const res = await fetch(`/api/conversations?${buildFilterParams(page)}`);
            if (res.ok) {
              const data = await res.json();
              const convs = data.conversations || data;
              if (convs.some((c: any) => c.id === nextConversation.id)) {
                foundPage = page;
                break;
              }
            }
          }
        }

        if (foundPage > 0 && foundPage !== pagination.page) {
          // Navigate to the page with the conversation
          await goToPage(foundPage);
          // Wait for page to load, then select the conversation
          setTimeout(() => {
            selectConversation(nextConversation.id);
            setNavigatingUnreplied(false);
          }, 200);
        } else {
          // Fallback: just select it
          selectConversation(nextConversation.id);
          setNavigatingUnreplied(false);
        }
      } else {
        // No pagination - just select it
        selectConversation(nextConversation.id);
        setNavigatingUnreplied(false);
      }
    } catch (error) {
      console.error("Error navigating to next unreplied:", error);
      setNavigatingUnreplied(false);
    }
  };

  const goToOldestUnreplied = async () => {
    if (navigatingUnreplied) return; // Prevent multiple clicks

    try {
      // Get globally oldest unreplied from API
      const response = await fetch(`/api/conversations/next-unreplied`);

      if (!response.ok) {
        console.error("Failed to fetch oldest unreplied:", response.status, response.statusText);
        alert("Failed to fetch oldest unreplied email. Please try again.");
        return;
      }

      const oldestConversation = await response.json();

      if (!oldestConversation || !oldestConversation.id) {
        alert("No unreplied emails!");
        return;
      }

      // Check if it's on current page
      const isOnCurrentPage = conversations.some(conv => conv.id === oldestConversation.id);

      if (isOnCurrentPage) {
        // INSTANT - already on current page
        selectConversation(oldestConversation.id);
      } else if (pagination) {
        // Cross-page navigation - show loading
        setNavigatingUnreplied(true);
        // Need to find which page has this conversation
        const oldestDate = new Date(oldestConversation.lastMessageAt).getTime();
        const currentPageOldest = new Date(conversations[conversations.length - 1]?.lastMessageAt || 0).getTime();
        const currentPageNewest = new Date(conversations[0]?.lastMessageAt || 0).getTime();

        let foundPage = 0;

        // Search strategy: oldest emails are usually on later pages
        if (oldestDate < currentPageOldest) {
          // Search forward through later pages (most likely)
          for (let page = pagination.page + 1; page <= pagination.totalPages; page++) {
            const res = await fetch(`/api/conversations?${buildFilterParams(page)}`);
            if (res.ok) {
              const data = await res.json();
              const convs = data.conversations || data;
              if (convs.some((c: any) => c.id === oldestConversation.id)) {
                foundPage = page;
                break;
              }
            }
          }
        } else if (oldestDate > currentPageNewest) {
          // Search backward through earlier pages
          for (let page = pagination.page - 1; page >= 1; page--) {
            const res = await fetch(`/api/conversations?${buildFilterParams(page)}`);
            if (res.ok) {
              const data = await res.json();
              const convs = data.conversations || data;
              if (convs.some((c: any) => c.id === oldestConversation.id)) {
                foundPage = page;
                break;
              }
            }
          }
        }

        // Full search fallback
        if (foundPage === 0) {
          for (let page = 1; page <= pagination.totalPages; page++) {
            if (page === pagination.page) continue;
            const res = await fetch(`/api/conversations?${buildFilterParams(page)}`);
            if (res.ok) {
              const data = await res.json();
              const convs = data.conversations || data;
              if (convs.some((c: any) => c.id === oldestConversation.id)) {
                foundPage = page;
                break;
              }
            }
          }
        }

        if (foundPage > 0 && foundPage !== pagination.page) {
          // Navigate to the page with the conversation
          await goToPage(foundPage);
          setTimeout(() => {
            selectConversation(oldestConversation.id);
            setNavigatingUnreplied(false);
          }, 200);
        } else {
          selectConversation(oldestConversation.id);
          setNavigatingUnreplied(false);
        }
      } else {
        selectConversation(oldestConversation.id);
        setNavigatingUnreplied(false);
      }
    } catch (error) {
      console.error("Error navigating to oldest unreplied:", error);
      setNavigatingUnreplied(false);
    }
  };

  // Helper: Calculate days and weeks since purchase
  const getDaysSincePurchase = (createdAt: string) => {
    const now = new Date();
    const orderDate = new Date(createdAt);
    const diffMs = now.getTime() - orderDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffWeeks = Math.floor(diffDays / 7);
    return { days: diffDays, weeks: diffWeeks };
  };

  // Helper: Copy tracking number
  const copyTrackingNumber = async (trackingNumber: string) => {
    try {
      await navigator.clipboard.writeText(trackingNumber);
      setCopiedTrackingNumber(trackingNumber);
      setTimeout(() => setCopiedTrackingNumber(null), 2000);
    } catch (err) {
      console.error("Failed to copy tracking number:", err);
    }
  };

  // Helper: Get tracking info from order fulfillments
  const getTrackingInfo = (order: any) => {
    if (order.fulfillments && order.fulfillments.length > 0) {
      const fulfillment = order.fulfillments[0];
      return {
        status: fulfillment.status,
        trackingNumber: fulfillment.tracking_number,
        trackingUrl: fulfillment.tracking_url,
        trackingCompany: fulfillment.tracking_company,
      };
    }
    return null;
  };

  // Fetch detailed tracking from 17track
  const fetchDetailedTracking = async (trackingNumber: string) => {
    if (!trackingNumber) return;

    setLoadingTracking(true);
    setTrackingError(null);
    setShowTrackingModal(true);

    try {
      const response = await fetch(`/api/tracking/${encodeURIComponent(trackingNumber)}`);

      if (!response.ok) {
        // Try to parse error response for friendly message
        try {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to fetch tracking information");
        } catch (parseError) {
          throw new Error("Failed to fetch tracking information");
        }
      }

      const data = await response.json();
      setTrackingData(data);
    } catch (error) {
      console.error("Error fetching tracking info:", error);
      setTrackingError(error instanceof Error ? error.message : "Failed to fetch tracking information");
    } finally {
      setLoadingTracking(false);
    }
  };

  // Generate AI draft
  const generateDraft = async () => {
    if (!selectedConversation) return;

    const conversationId = selectedConversation.id;

    // Set loading state for this specific conversation
    setLoadingDraftByConversationId(prev => ({
      ...prev,
      [conversationId]: true
    }));
    setDraftError(null);
    // Don't auto-open popup - let user click to view when ready

    // Clear current conversation's draft while loading
    setDraftsByConversationId(prev => ({
      ...prev,
      [conversationId]: null
    }));

    try {
      // Call API server directly to avoid Next.js proxy timeout
      // In production, this would use the same domain, but in dev we bypass the proxy
      const apiUrl = process.env.NODE_ENV === 'development'
        ? `http://localhost:3001/conversations/${conversationId}/draft`
        : `/api/conversations/${conversationId}/draft`;

      const response = await fetch(apiUrl, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to generate draft");
      }

      const data = await response.json();

      // Store draft by conversation ID
      setDraftsByConversationId(prev => ({
        ...prev,
        [conversationId]: data
      }));

      // Update conversation tags optimistically if draft added new tags
      if (data.tags && data.tags.length > 0) {
        const currentTags = selectedConversation.tags || [];
        const uniqueTags = Array.from(new Set([...currentTags, ...data.tags]));
        updateConversationOptimistic(conversationId, {
          tags: uniqueTags
        });
      }
    } catch (error) {
      console.error("Error generating draft:", error);
      setDraftError(error instanceof Error ? error.message : "Failed to generate draft");
    } finally {
      // Clear loading state for this specific conversation
      setLoadingDraftByConversationId(prev => ({
        ...prev,
        [conversationId]: false
      }));
    }
  };

  // Search for Shopify customer by email or name
  const handleShopifySearch = async () => {
    if (!shopifySearchQuery.trim()) return;

    setSearchingShopify(true);
    setShopifyError(null);
    setShopifyCustomer(null);
    setShopifyOrders([]);
    setSelectedOrder(null);

    try {
      // Try searching by email first (exact match)
      const emailResponse = await fetch(`/api/shopify/customer?email=${encodeURIComponent(shopifySearchQuery.trim())}`);

      if (emailResponse.ok) {
        const customer = await emailResponse.json();
        setShopifyCustomer(customer);

        // Fetch customer orders
        const ordersResponse = await fetch(`/api/shopify/customer/${customer.id}/orders`);
        if (ordersResponse.ok) {
          const orders = await ordersResponse.json();
          setShopifyOrders(orders);
        }
      } else {
        setShopifyError("Customer not found in Shopify");
      }
    } catch (err) {
      console.error("Failed to search Shopify customer:", err);
      setShopifyError("Failed to search for customer");
    } finally {
      setSearchingShopify(false);
    }
  };

  // AI-powered email detection from email content
  const handleAIDetectEmail = async () => {
    if (!selectedConversation) return;

    setDetectingEmail(true);
    setShopifyError(null);

    try {
      // Get the most recent message
      const latestMessage = selectedConversation.messages[selectedConversation.messages.length - 1];

      // Prepare email content for AI
      const fromEmail = latestMessage.fromEmail;
      const subject = selectedConversation.subject;
      const emailBody = latestMessage.bodyText || latestMessage.bodyHtml || '';

      // Call backend AI endpoint to extract email
      const response = await fetch('/api/ai/extract-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromEmail,
          subject,
          emailBody,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to detect email');
      }

      const { email } = await response.json();

      if (email === 'NONE' || !email) {
        setShopifyError('No customer email found in the message');
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setShopifyError('Invalid email format detected');
        return;
      }

      // Set the detected email in search query and trigger search
      setShopifySearchQuery(email);

      // Auto-search with detected email
      setSearchingShopify(true);
      const emailResponse = await fetch(`/api/shopify/customer?email=${encodeURIComponent(email)}`);

      if (emailResponse.ok) {
        const customer = await emailResponse.json();
        setShopifyCustomer(customer);

        // Fetch customer orders
        const ordersResponse = await fetch(`/api/shopify/customer/${customer.id}/orders`);
        if (ordersResponse.ok) {
          const orders = await ordersResponse.json();
          setShopifyOrders(orders);
        }
      } else {
        setShopifyError(`Customer not found in Shopify: ${email}`);
      }
      setSearchingShopify(false);
    } catch (err) {
      console.error('Failed to detect email:', err);
      setShopifyError('Failed to detect customer email');
    } finally {
      setDetectingEmail(false);
    }
  };

  // Handle file attachments
  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setComposerAttachments([...composerAttachments, ...files]);
    }
  };

  // Remove attachment
  const removeAttachment = (index: number) => {
    setComposerAttachments(composerAttachments.filter((_, i) => i !== index));
  };

  // Send email from composer
  const handleSendComposerEmail = async () => {
    // Get text content from contentEditable div
    const textContent = composerBodyRef.current?.textContent || "";

    if (!composerTo.trim() || !textContent.trim()) {
      alert("Please provide recipient email and message body");
      return;
    }

    // Convert plain text to Gmail-compatible HTML
    const htmlContent = textToGmailHtml(textContent);

    setSendingEmail(true);
    try {
      // Only associate with current conversation if sending to the same customer
      const isReplyToCurrentConversation = selectedConversation?.customer?.primaryEmail === composerTo.trim();

      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: isReplyToCurrentConversation ? selectedConversation?.id : undefined,
          to: composerTo,
          subject: composerSubject,
          body: htmlContent,
        }),
      });

      // Check if the request was successful
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      // Only clear and close if send was successful
      closeEmailComposer();
      setComposerTo("");
      setComposerSubject("");
      if (composerBodyRef.current) {
        composerBodyRef.current.innerHTML = "";
      }
      setComposerBody("");
      setComposerAttachments([]);
      await refreshConversations();
    } catch (error) {
      console.error("Failed to send email:", error);
      alert(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`);
    } finally {
      setSendingEmail(false);
    }
  };

  // Open refund modal
  const openRefundModal = (order: any) => {
    setRefundOrder(order);
    setRefundMode('simple');
    setRefundType('preset');
    setRefundPreset(80);
    setRefundCustomPercentage("");
    setRefundCustomDollar("");
    setRefundReason("");
    setRefundNotifyCustomer(true);
    setRefundRestock(false);
    setRefundConfirmation(false);
    setSelectedLineItems(new Map());
    setShowRefundModal(true);
  };

  // Calculate refund amount
  const calculateRefundAmount = (): number => {
    if (!refundOrder) return 0;

    // Items mode: Calculate based on selected line items
    if (refundMode === 'items') {
      let total = 0;
      refundOrder.line_items?.forEach((item: any) => {
        const selectedItem = selectedLineItems.get(item.id);
        if (selectedItem && selectedItem.quantity > 0) {
          const itemPrice = parseFloat(item.price);
          total += itemPrice * selectedItem.quantity;
        }
      });
      return total;
    }

    // Simple mode: Use preset/percentage/dollar
    const orderTotal = parseFloat(refundOrder.total_price);

    switch (refundType) {
      case 'full':
        return orderTotal;
      case 'preset':
        return orderTotal * (refundPreset / 100);
      case 'percentage':
        const percentage = parseFloat(refundCustomPercentage) || 0;
        return orderTotal * (percentage / 100);
      case 'dollar':
        const dollarAmount = parseFloat(refundCustomDollar) || 0;
        return Math.min(dollarAmount, orderTotal);
      default:
        return 0;
    }
  };

  // Process refund
  const handleProcessRefund = async () => {
    if (!refundOrder) return;

    const refundAmount = calculateRefundAmount();

    if (refundAmount <= 0) {
      alert("Please enter a valid refund amount");
      return;
    }

    if (!refundConfirmation) {
      setRefundConfirmation(true);
      return;
    }

    setProcessingRefund(true);

    try {
      // Create refund line items based on mode
      let refundLineItems;

      if (refundMode === 'items') {
        // Items mode: Use only selected items with their quantities
        refundLineItems = refundOrder.line_items
          .filter((item: any) => {
            const selectedItem = selectedLineItems.get(item.id);
            return selectedItem && selectedItem.quantity > 0;
          })
          .map((item: any) => {
            const selectedItem = selectedLineItems.get(item.id)!;
            return {
              line_item_id: item.id,
              quantity: selectedItem.quantity,
              restock_type: selectedItem.restock ? 'return' : 'no_restock',
            };
          });
      } else {
        // Simple mode: Refund all items with full quantity
        refundLineItems = refundOrder.line_items.map((item: any) => ({
          line_item_id: item.id,
          quantity: item.quantity,
          restock_type: refundRestock ? 'return' : 'no_restock',
        }));
      }

      const response = await fetch(`/api/shopify/order/${refundOrder.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refundLineItems,
          amount: refundAmount.toFixed(2),
          reason: refundReason || 'Customer request',
          notify: refundNotifyCustomer,
          note: refundReason,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process refund');
      }

      const refundData = await response.json();

      alert(`Refund processed successfully! Refund ID: ${refundData.id}`);

      // Refresh Shopify orders
      if (shopifyCustomer) {
        const ordersResponse = await fetch(`/api/shopify/customer/${shopifyCustomer.id}/orders`);
        if (ordersResponse.ok) {
          const orders = await ordersResponse.json();
          setShopifyOrders(orders);
        }
      }

      setShowRefundModal(false);
      setRefundOrder(null);
      setSelectedOrder(null);
    } catch (error) {
      console.error('Failed to process refund:', error);
      alert(`Failed to process refund: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setProcessingRefund(false);
      setRefundConfirmation(false);
    }
  };

  // Line item selection helpers
  const toggleLineItem = (lineItemId: number, quantity: number) => {
    const newSelected = new Map(selectedLineItems);
    if (newSelected.has(lineItemId)) {
      newSelected.delete(lineItemId);
    } else {
      newSelected.set(lineItemId, { quantity, restock: false });
    }
    setSelectedLineItems(newSelected);
  };

  const updateLineItemQuantity = (lineItemId: number, quantity: number) => {
    const newSelected = new Map(selectedLineItems);
    const current = newSelected.get(lineItemId);
    if (current) {
      newSelected.set(lineItemId, { ...current, quantity });
      setSelectedLineItems(newSelected);
    }
  };

  const toggleLineItemRestock = (lineItemId: number) => {
    const newSelected = new Map(selectedLineItems);
    const current = newSelected.get(lineItemId);
    if (current) {
      newSelected.set(lineItemId, { ...current, restock: !current.restock });
      setSelectedLineItems(newSelected);
    }
  };

  const handleAddTag = async () => {
    if (!newTag.trim() || !selectedConversation) return;

    const currentTags = selectedConversation.tags || [];
    if (currentTags.includes(newTag.trim())) {
      setNewTag("");
      return;
    }

    const updatedTags = [...currentTags, newTag.trim()];

    // Optimistic update - instant UI feedback
    updateConversationOptimistic(selectedConversation.id, { tags: updatedTags });
    setNewTag("");
    setEditingTags(false);

    try {
      const response = await fetch(`/api/conversations/${selectedConversation.id}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: updatedTags }),
      });

      if (!response.ok) {
        throw new Error('Failed to update tags');
      }

      // Don't refresh conversations - optimistic update is enough
      // This prevents race condition where server data overwrites our update
    } catch (error) {
      console.error("Failed to add tag:", error);
      // Revert on error
      updateConversationOptimistic(selectedConversation.id, { tags: currentTags });
    }
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    if (!selectedConversation) return;

    const currentTags = selectedConversation.tags || [];
    const newTags = currentTags.filter(tag => tag !== tagToRemove);

    // Optimistic update - instant UI feedback
    updateConversationOptimistic(selectedConversation.id, { tags: newTags });

    try {
      const response = await fetch(`/api/conversations/${selectedConversation.id}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: newTags }),
      });

      if (!response.ok) {
        throw new Error('Failed to update tags');
      }

      // Don't refresh conversations - optimistic update is enough
      // This prevents race condition where server data overwrites our update
    } catch (error) {
      console.error("Failed to remove tag:", error);
      // Revert on error
      updateConversationOptimistic(selectedConversation.id, { tags: currentTags });
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  if (!selectedConversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background p-12">
        <div className="max-w-md text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-8 h-8 text-primary"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-sans font-semibold text-foreground">Inbox</h2>
          <p className="text-muted-foreground font-sans">
            Select a conversation from the list to view and reply to messages
          </p>
          <div className="pt-4 space-y-2 text-sm font-sans text-muted-foreground">
            <p className="flex items-center gap-2 justify-center">
              <span className="text-primary">→</span>
              Use filters to find specific conversations
            </p>
            <p className="flex items-center gap-2 justify-center">
              <span className="text-primary">→</span>
              Click &quot;Next&quot; to jump to unreplied emails
            </p>
            <p className="flex items-center gap-2 justify-center">
              <span className="text-primary">→</span>
              Star important conversations for quick access
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex bg-background overflow-hidden min-w-0" style={{ fontFamily: "Roboto, sans-serif" }}>
      {/* Main Email View */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header - Fixed Height */}
        <div className="p-6 border-b border-border shrink-0">
          <h2 className="text-xl font-sans font-semibold text-foreground mb-3">
            {selectedConversation.subject}
          </h2>
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-sm font-sans font-medium text-primary">
                  {(selectedConversation.customer.name || selectedConversation.customer.primaryEmail)[0].toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-sm font-sans font-medium text-foreground">
                  {selectedConversation.customer.name || selectedConversation.customer.primaryEmail}
                </p>
                <p className="text-xs font-sans text-muted-foreground">
                  {selectedConversation.customer.primaryEmail}
                </p>
              </div>
            </div>
          </div>

          {/* Tag Management */}
          <div className="flex items-center gap-2 flex-wrap">
            {selectedConversation.tags?.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs font-sans rounded-md border border-primary/20"
              >
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="hover:text-primary/70 ml-1 font-sans"
                  title="Remove tag"
                >
                  ✕
                </button>
              </span>
            ))}
            {editingTags ? (
              <div className="inline-flex items-center gap-1">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                  placeholder="New tag..."
                  className="px-2 py-1 text-xs font-sans bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary w-24"
                  autoFocus
                />
                <button
                  onClick={handleAddTag}
                  className="px-2 py-1 bg-success text-white text-xs font-sans rounded-md hover:bg-success/90"
                >
                  Add
                </button>
                <button
                  onClick={() => { setEditingTags(false); setNewTag(""); }}
                  className="px-2 py-1 bg-muted text-muted-foreground text-xs font-sans rounded-md hover:bg-muted/80"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingTags(true)}
                className="px-2 py-1 bg-muted text-muted-foreground text-xs font-sans rounded-md hover:bg-accent transition-colors"
              >
                + Tag
              </button>
            )}
          </div>
        </div>


      {/* Messages */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-6">
        {selectedConversation.messages.map((message) => (
          <div
            key={message.id}
            className={`rounded-lg border p-4 ${
              message.direction === "outbound" ? "ml-12" : ""
            }`}
            style={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb' }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-sans text-primary" style={{ fontWeight: 400 }}>
                    {message.fromEmail[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-sans" style={{ fontWeight: 400, color: '#000000' }}>
                    {message.fromEmail}
                  </p>
                  <p className="text-xs font-sans" style={{ fontWeight: 400, color: '#000000' }}>
                    to: {message.toEmails.join(", ")}
                  </p>
                </div>
              </div>
              <span className="text-xs font-sans" style={{ fontWeight: 400, color: '#000000' }}>
                {formatDate(message.sentAt)}
              </span>
            </div>
            <div className="email-content">
              {message.bodyHtml ? (
                <div
                  className="email-html-container font-sans p-4 rounded border overflow-y-auto overflow-x-hidden"
                  style={{
                    fontWeight: 400,
                    fontSize: '14px',
                    lineHeight: 1.6,
                    maxWidth: '100%',
                    width: '100%',
                    backgroundColor: '#ffffff',
                    color: '#000000',
                    borderColor: '#e5e7eb'
                  }}
                  dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(message.bodyHtml) }}
                />
              ) : (
                <p className="text-sm font-sans whitespace-pre-wrap overflow-hidden" style={{ fontWeight: 400, color: '#000000', maxWidth: '100%', wordWrap: 'break-word' }}>
                  {message.bodyText}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>


      {/* Reply Section */}
      <div className="border-t border-border p-6 shrink-0">
        <div className="mb-4">
          <div
            ref={replyEditorRef}
            contentEditable
            onInput={(e) => {
              setReplyText(e.currentTarget.textContent || "");
            }}
            onKeyDown={(e) => {
              // Handle Enter key to insert newlines properly
              if (e.key === 'Enter') {
                e.preventDefault();

                const selection = window.getSelection();
                if (!selection?.rangeCount) return;

                const range = selection.getRangeAt(0);
                const textNode = document.createTextNode('\n');
                range.insertNode(textNode);

                // Move cursor after the newline
                range.setStartAfter(textNode);
                range.setEndAfter(textNode);
                selection.removeAllRanges();
                selection.addRange(range);

                // Update state
                setReplyText(e.currentTarget.textContent || "");
              }
            }}
            onPaste={(e) => {
              // Prevent default paste to avoid unwanted HTML formatting
              e.preventDefault();

              // Get plain text from clipboard
              const text = e.clipboardData?.getData('text/plain') || '';

              // Insert plain text at cursor position
              const selection = window.getSelection();
              if (!selection?.rangeCount) return;

              selection.deleteFromDocument();
              const range = selection.getRangeAt(0);
              const textNode = document.createTextNode(text);
              range.insertNode(textNode);

              // Move cursor to end of inserted text
              range.setStartAfter(textNode);
              range.setEndAfter(textNode);
              selection.removeAllRanges();
              selection.addRange(range);

              // Update state
              setReplyText(e.currentTarget.textContent || "");
            }}
            data-placeholder="Type your reply..."
            className="w-full min-h-32 p-4 font-sans bg-white rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 overflow-y-auto empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 empty:before:pointer-events-none"
            style={{
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word'
            }}
          />
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={handleSend}
            disabled={!replyText.trim() || sending}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-sans font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? "Sending..." : "Send"}
          </button>
          <p className="text-xs font-sans text-muted-foreground">
            Replying to {getReplyToEmail()}
          </p>
        </div>
      </div>
    </div>

    {/* Right Sidebar Resize Handle */}
    <div
      onMouseDown={(e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = rightSidebarWidth;

        const handleMouseMove = (moveEvent: MouseEvent) => {
          const delta = startX - moveEvent.clientX; // Reversed delta for right sidebar
          const newWidth = Math.max(280, Math.min(600, startWidth + delta)); // Min 280px, Max 600px
          setRightSidebarWidth(newWidth);
        };

        const handleMouseUp = () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      }}
      className="w-1 hover:w-2 bg-border hover:bg-primary cursor-col-resize shrink-0 transition-all group relative"
    >
      <div className="absolute inset-y-0 -left-1 -right-1"></div>
    </div>

    {/* Right Sidebar */}
    <div style={{ width: `${rightSidebarWidth}px` }} className="border-l border-gray-200 bg-gray-50 flex flex-col shrink-0 overflow-y-auto">
      {/* Related Conversations Section */}
      <div className="border-b border-gray-200">
        <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-gray-50 border-b border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <h3 className="font-sans font-semibold text-slate-800 text-sm">Related Conversations</h3>
            </div>
            <button
              onClick={() => setShowAllHistory(true)}
              className="text-xs font-sans font-medium text-slate-600 hover:text-slate-800 transition-colors flex items-center gap-1"
            >
              <span>View All</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNeedsReplyOnly(!showNeedsReplyOnly)}
              className={`px-2 py-1 rounded text-[10px] font-sans font-medium transition-colors ${
                showNeedsReplyOnly
                  ? "bg-orange-100 text-orange-700 border border-orange-200"
                  : "bg-slate-100 text-slate-600 border border-slate-200"
              }`}
            >
              📩 Needs Reply {showNeedsReplyOnly ? '✓' : ''}
            </button>
            <span className="text-[10px] font-sans text-slate-500">
              {filteredHistory.length} of {history.length}
            </span>
          </div>
        </div>

        <div className="h-[320px] overflow-y-auto px-3 py-3 bg-white space-y-2">
          {loadingHistory ? (
            <>
              {[1, 2].map((i) => (
                <div key={i} className="w-full p-3 bg-slate-50 animate-pulse rounded-lg border border-slate-100">
                  <div className="h-3 bg-slate-200 rounded w-3/4 mb-2"></div>
                  <div className="h-2 bg-slate-200 rounded w-1/2"></div>
                </div>
              ))}
            </>
          ) : filteredHistory.length > 0 ? (
            filteredHistory.slice(0, 4).map((conv) => {
              const isExpanded = expandedPreviews.has(conv.id);
              const lastMessage = conv.messages && conv.messages.length > 0 ? conv.messages[conv.messages.length - 1] : null;
              const messagePreview = lastMessage
                ? (lastMessage.bodyText?.substring(0, 150) || lastMessage.bodyHtml?.replace(/<[^>]*>/g, '').substring(0, 150) || 'No content available')
                : 'No messages';

              return (
                <div
                  key={conv.id}
                  className="w-full bg-white border border-slate-200 hover:border-slate-300 rounded-lg transition-all overflow-hidden shadow-sm"
                >
                  {/* Main conversation info */}
                  <div className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onClick={() => {
                          console.log('Navigating to conversation:', conv.id);
                          selectConversation(conv.id);
                        }}
                        className="flex-1 text-left group"
                      >
                        <p className="text-xs font-sans font-semibold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2 mb-1">
                          {conv.subject || 'No Subject'}
                        </p>
                        <p className="text-[10px] font-sans text-slate-500 flex items-center gap-2">
                          <span>{new Date(conv.lastMessageAt).toLocaleDateString()}</span>
                          <span>•</span>
                          <span>{conv.messages?.length || 0} messages</span>
                        </p>
                      </button>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          const newSet = new Set(expandedPreviews);
                          if (isExpanded) {
                            newSet.delete(conv.id);
                          } else {
                            newSet.add(conv.id);
                          }
                          setExpandedPreviews(newSet);
                        }}
                        className="flex-1 px-2 py-1.5 text-[10px] font-sans font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded transition-colors flex items-center justify-center gap-1"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        <span>{isExpanded ? 'Hide' : 'Preview'}</span>
                      </button>

                      <button
                        onClick={async () => {
                          try {
                            // Fetch and select the conversation (handles adding it to the list if needed)
                            await fetchAndSelectConversation(conv.id);
                          } catch (error) {
                            console.error('Error opening conversation:', error);
                            alert('Failed to open conversation. Please try again.');
                          }
                        }}
                        className="flex-1 px-2 py-1.5 text-[10px] font-sans font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition-colors flex items-center justify-center gap-1"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        <span>Open</span>
                      </button>

                      <button
                        onClick={async () => {
                          try {
                            // Mark conversation as archived (resolved)
                            const updateResponse = await fetch(`/api/conversations/${conv.id}/archive`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({}),
                            });

                            if (!updateResponse.ok) {
                              throw new Error('Failed to mark as resolved');
                            }

                            // Remove from history list immediately for instant feedback
                            setHistory(prevHistory => prevHistory.filter((c: ConversationHistory) => c.id !== conv.id));

                            // Refresh conversations list in the background
                            await refreshConversations();
                          } catch (error) {
                            console.error('Failed to mark as resolved:', error);
                            // Optionally: Show error message to user
                            alert('Failed to mark conversation as resolved. Please try again.');
                          }
                        }}
                        className="px-2 py-1.5 text-[10px] font-sans font-medium text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 rounded transition-colors flex items-center gap-1"
                        title="Mark as Resolved"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Resolve</span>
                      </button>

                      <button
                        onClick={async () => {
                          try {
                            // Add non-customer-support tag to conversation
                            const currentTags = conv.tags || [];
                            const updatedTags = [...currentTags, "non-customer-support"];

                            const updateResponse = await fetch(`/api/conversations/${conv.id}/tags`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ tags: updatedTags }),
                            });

                            if (!updateResponse.ok) {
                              throw new Error('Failed to mark as non-support');
                            }

                            // Remove from history list immediately for instant feedback
                            setHistory(prevHistory => prevHistory.filter((c: ConversationHistory) => c.id !== conv.id));

                            // Refresh conversations list in the background
                            await refreshConversations();
                          } catch (error) {
                            console.error('Failed to mark as non-support:', error);
                            alert('Failed to mark conversation as non-support. Please try again.');
                          }
                        }}
                        className="px-2 py-1.5 text-[10px] font-sans font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded transition-colors flex items-center gap-1"
                        title="Mark as Non-Support"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                        <span>Non-CS</span>
                      </button>
                    </div>

                    {/* Preview section */}
                    {isExpanded && (
                      <div className="pt-2 border-t border-slate-100 animate-in fade-in duration-200">
                        <p className="text-[10px] font-sans text-slate-600 leading-relaxed whitespace-pre-wrap">
                          {messagePreview}{messagePreview.length >= 150 ? '...' : ''}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-6 text-center">
              <svg className="w-10 h-10 text-slate-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <p className="text-xs font-sans text-slate-500">No related conversations</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions Section */}
      <div className="border-b border-gray-200">
        <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <h3 className="font-sans font-semibold text-emerald-900 text-sm">Quick Actions</h3>
          </div>
        </div>

        <div className="px-4 py-3 bg-white space-y-2">
          {/* Next Unreplied Button */}
          <button
            onClick={goToNextUnreplied}
            disabled={navigatingUnreplied}
            className="w-full px-3 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors text-sm font-sans font-medium disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-between shadow-sm"
          >
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
              <span>{navigatingUnreplied ? 'Navigating...' : 'Next Unreplied'}</span>
            </div>
          </button>

          {/* Oldest Unreplied Button */}
          <button
            onClick={goToOldestUnreplied}
            className="w-full px-3 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-md transition-colors text-sm font-sans font-medium flex items-center justify-between shadow-sm"
          >
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <span>Oldest Unreplied</span>
            </div>
          </button>

          {/* Mark as Non-Support Button */}
          {!selectedConversation.tags?.includes("non-customer-support") && (
            <button
              onClick={handleMarkNonSupport}
              className="w-full px-3 py-2.5 bg-white border-2 border-orange-300 hover:bg-orange-50 text-orange-700 rounded-md transition-colors text-sm font-sans font-medium flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                <span>Mark as Non-Support</span>
              </div>
            </button>
          )}

          {/* Mark as Resolved Button */}
          <button
            onClick={handleMarkResolved}
            className="w-full px-3 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-md transition-colors text-sm font-sans font-medium flex items-center justify-between shadow-sm"
          >
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Mark as Resolved</span>
            </div>
          </button>
        </div>
      </div>

      {/* Shopify Section */}
      <div className="border-b border-gray-200">
        <div className="px-4 py-3 bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              <h3 className="font-sans font-semibold text-purple-900 text-sm">Shopify Customer</h3>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleAIDetectEmail}
                disabled={detectingEmail || !selectedConversation}
                className="px-2 py-1 bg-purple-500 hover:bg-purple-600 text-white rounded text-[10px] font-sans font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap shadow-sm"
                title="Use AI to detect customer email from message"
              >
                {detectingEmail ? "Detecting..." : "AI Detect"}
              </button>
              {shopifyCustomer && (
                <span className="text-[10px] font-sans font-medium text-green-700">● Connected</span>
              )}
            </div>
          </div>

          {/* Search for Customer */}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={shopifySearchQuery}
              onChange={(e) => setShopifySearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleShopifySearch()}
              placeholder="Search by email or name..."
              className="flex-1 px-2 py-1.5 text-xs font-sans bg-white text-gray-900 placeholder:text-gray-500 border border-purple-200 rounded focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-300"
            />
            <button
              onClick={handleShopifySearch}
              disabled={searchingShopify || !shopifySearchQuery.trim()}
              className="px-2 py-1.5 bg-purple-500 hover:bg-purple-600 text-white rounded text-xs font-sans font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {searchingShopify ? "..." : "Search"}
            </button>
          </div>
        </div>

        <div className="px-4 py-3 bg-white h-[400px] overflow-y-auto flex flex-col">
          {loadingShopify ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500 mx-auto mb-2"></div>
                <p className="text-xs font-sans text-gray-600">Loading...</p>
              </div>
            </div>
          ) : shopifyError ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="p-3 bg-gray-50 rounded text-center">
                <p className="text-xs font-sans text-gray-700">{shopifyError}</p>
              </div>
            </div>
          ) : shopifyCustomer ? (
            <>
              {/* Customer Info */}
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded p-3">
                <p className="text-sm font-sans font-semibold text-purple-900 mb-2">
                  {shopifyCustomer.first_name} {shopifyCustomer.last_name}
                </p>
                <div className="space-y-1 text-xs font-sans text-gray-700">
                  <p>Orders: <span className="font-semibold text-purple-900">{shopifyCustomer.orders_count}</span></p>
                  <p>Total Spent: <span className="font-semibold text-purple-900">${parseFloat(shopifyCustomer.total_spent).toFixed(2)}</span></p>
                  <p className={shopifyCustomer.verified_email ? "text-green-700 font-medium" : "text-red-700 font-medium"}>
                    {shopifyCustomer.verified_email ? "✓ Email Verified" : "✗ Email Not Verified"}
                  </p>
                </div>
              </div>

              {/* Order List */}
              {shopifyOrders.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-sans font-semibold text-gray-800 px-1">Recent Orders</p>
                  {shopifyOrders.slice(0, 5).map((order) => {
                    const trackingInfo = getTrackingInfo(order);
                    const { days, weeks } = getDaysSincePurchase(order.created_at);

                    return (
                      <div
                        key={order.id}
                        onClick={() => setSelectedOrder(order.id === selectedOrder?.id ? null : order)}
                        className="w-full text-left p-3 bg-gray-50 border border-gray-200 hover:border-purple-300 hover:bg-purple-50 rounded transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-sm font-sans font-semibold text-gray-900">
                            {order.name}
                          </p>
                          <span className={`text-[10px] font-sans font-semibold px-1.5 py-0.5 rounded ${
                            order.financial_status === "paid"
                              ? "bg-green-100 text-green-800"
                              : order.financial_status === "refunded"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800"
                          }`}>
                            {order.financial_status}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs font-sans text-gray-700 mb-1">
                          <span>{new Date(order.created_at).toLocaleDateString()}</span>
                          <span className="font-bold text-gray-900">${parseFloat(order.total_price).toFixed(2)}</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="text-[10px] font-sans text-gray-600">
                            {days} days ago ({weeks}w)
                          </div>

                          {/* Fulfillment Status Badge */}
                          <span className={`text-[10px] font-sans font-semibold px-1.5 py-0.5 rounded ${
                            order.fulfillment_status === "fulfilled"
                              ? "bg-blue-100 text-blue-800"
                              : order.fulfillment_status === "partial"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-gray-200 text-gray-700"
                          }`}>
                            {order.fulfillment_status === "fulfilled"
                              ? "Shipped"
                              : order.fulfillment_status === "partial"
                              ? "Partial"
                              : "Unfulfilled"}
                          </span>
                        </div>

                        {/* Order Details (Expanded) */}
                        {selectedOrder?.id === order.id && (
                          <div className="mt-2 pt-2 border-t border-slate-200 space-y-2" onClick={(e) => e.stopPropagation()}>
                            {/* Tracking Information */}
                            {trackingInfo && trackingInfo.trackingNumber && (
                              <div className="bg-slate-50 border border-slate-200 rounded p-2">
                                <p className="text-[10px] font-sans font-semibold text-slate-700 mb-1.5">Tracking</p>
                                <div className="space-y-1 text-[10px] font-sans text-slate-600">
                                  <p className="flex items-center justify-between">
                                    <span>Status:</span>
                                    <span className="font-medium text-slate-800">{trackingInfo.status || 'Unknown'}</span>
                                  </p>
                                  {trackingInfo.trackingCompany && (
                                    <p className="flex items-center justify-between">
                                      <span>Carrier:</span>
                                      <span className="font-medium text-slate-800">{trackingInfo.trackingCompany}</span>
                                    </p>
                                  )}
                                  <div className="flex items-center justify-between gap-2">
                                    <span>Number:</span>
                                    <div className="flex items-center gap-1">
                                      <span className="font-mono text-[10px] text-slate-800">{trackingInfo.trackingNumber}</span>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          copyTrackingNumber(trackingInfo.trackingNumber);
                                        }}
                                        className="p-0.5 hover:bg-slate-200 rounded transition-colors"
                                        title="Copy tracking number"
                                      >
                                        {copiedTrackingNumber === trackingInfo.trackingNumber ? (
                                          <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                          </svg>
                                        ) : (
                                          <svg className="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                          </svg>
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      fetchDetailedTracking(trackingInfo.trackingNumber);
                                    }}
                                    className="mt-1 w-full px-2 py-1.5 bg-slate-600 hover:bg-slate-700 text-white rounded text-[10px] font-sans font-medium transition-colors flex items-center justify-center gap-1"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    Track with 17track
                                  </button>
                                </div>
                              </div>
                            )}

                            <div className="text-[10px] font-sans space-y-0.5 bg-slate-50 border border-slate-200 rounded p-2">
                              <p className="flex justify-between text-slate-600">
                                <span>Subtotal:</span>
                                <span className="text-slate-800 font-medium">${parseFloat(order.subtotal_price).toFixed(2)}</span>
                              </p>
                              <p className="flex justify-between text-slate-600">
                                <span>Tax:</span>
                                <span className="text-slate-800 font-medium">${parseFloat(order.total_tax).toFixed(2)}</span>
                              </p>
                              <p className="flex justify-between font-semibold text-slate-800 pt-0.5 border-t border-slate-200">
                                <span>Total:</span>
                                <span>${parseFloat(order.total_price).toFixed(2)}</span>
                              </p>
                            </div>

                            <div className="text-[10px] font-sans bg-slate-50 border border-slate-200 rounded p-2">
                              <p className="text-slate-700 mb-1 font-semibold">Items:</p>
                              <div className="space-y-0.5">
                                {order.line_items.map((item: any) => (
                                  <div key={item.id} className="flex justify-between text-slate-600">
                                    <span className="truncate mr-2">{item.quantity}x {item.name}</span>
                                    <span className="font-medium text-slate-800">${parseFloat(item.price).toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="flex flex-col gap-1.5 pt-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openRefundModal(order);
                                }}
                                className="w-full px-2 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[10px] font-sans font-medium rounded transition-colors"
                              >
                                Process Refund
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(`https://${process.env.NEXT_PUBLIC_SHOPIFY_STORE || 'put1rp-iq.myshopify.com'}/admin/orders/${order.id}`, '_blank');
                                }}
                                className="w-full px-2 py-1.5 bg-slate-600 hover:bg-slate-700 text-white text-[10px] font-sans font-medium rounded transition-colors"
                              >
                                View in Shopify
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-3 bg-gray-50 rounded text-center">
                  <p className="text-xs font-sans text-gray-600">No orders found</p>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="p-3 bg-gray-50 rounded text-center">
                <p className="text-xs font-sans text-gray-600">No Shopify customer found</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Assistant Section */}
      <div className="border-b border-gray-200">
        <div className="px-4 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <h3 className="font-sans font-semibold text-amber-900 text-sm">AI Assistant</h3>
          </div>
        </div>

        <div className="px-4 py-3 bg-white space-y-2">
          {/* Draft Button with KB Info */}
          <div className="relative">
            <button
              onClick={() => {
                if (loadingDraft) {
                  return;
                }

                if (draftMinimized && showDraftPopup) {
                  setDraftMinimized(false);
                } else if (draftData && showDraftPopup && !draftMinimized) {
                  setDraftMinimized(true);
                } else if (draftData && !showDraftPopup) {
                  setShowDraftPopup(true);
                  setDraftMinimized(false);
                } else if (!draftData && !loadingDraft) {
                  generateDraft();
                }
              }}
              disabled={!selectedConversation}
              className="w-full px-3 py-2.5 bg-violet-500 hover:bg-violet-600 text-white rounded-md transition-colors text-sm font-sans font-medium disabled:opacity-60 disabled:cursor-not-allowed relative flex items-center justify-between shadow-sm"
            >
              {loadingDraft && (
                <div className="absolute inset-0 bg-violet-600/90 rounded-md flex items-center justify-center">
                  <svg className="w-4 h-4 animate-spin text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span>{loadingDraft ? 'Generating...' : (draftData ? 'AI Draft' : 'Draft')}</span>
                {/* Draft ready indicator */}
                {draftData && !showDraftPopup && !loadingDraft && (
                  <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              {/* Info Icon */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setShowKBTab(!showKBTab);
                }}
                className="p-0.5 hover:bg-white/20 rounded transition-colors cursor-pointer"
                title="View Knowledge Base"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowKBTab(!showKBTab);
                  }
                }}
              >
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
            </button>

            {/* Expandable Knowledge Base Tab for Draft */}
            {showKBTab && (
              <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-white border border-slate-300 rounded shadow-lg overflow-hidden">
                {/* Header */}
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    <span className="text-xs font-sans font-semibold text-slate-700">Draft Knowledge Base</span>
                  </div>
                  <button
                    onClick={() => setShowKBTab(false)}
                    className="p-0.5 hover:bg-slate-200 rounded transition-colors"
                    title="Close"
                  >
                    <svg className="w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Content */}
                <div className="max-h-64 overflow-y-auto p-2 space-y-1.5">
                  {/* General Guidelines */}
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <button
                      onClick={() => setExpandedKBSections(prev => ({ ...prev, general: !prev.general }))}
                      className="w-full px-2 py-1.5 bg-slate-50 hover:bg-slate-100 transition-colors flex items-center justify-between text-left"
                    >
                      <span className="text-[10px] font-sans font-semibold text-slate-700">General Guidelines</span>
                      <svg className={`w-3 h-3 text-slate-600 transition-transform ${expandedKBSections.general ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {expandedKBSections.general && (
                      <div className="px-2 py-1.5 bg-white text-[9px] font-sans text-slate-600 space-y-0.5">
                        <div>• Email Classification Tags</div>
                        <div>• Link Policy</div>
                        <div>• Draft Requirements</div>
                      </div>
                    )}
                  </div>

                  {/* Tool Specific */}
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <button
                      onClick={() => setExpandedKBSections(prev => ({ ...prev, toolSpecific: !prev.toolSpecific }))}
                      className="w-full px-2 py-1.5 bg-slate-50 hover:bg-slate-100 transition-colors flex items-center justify-between text-left"
                    >
                      <span className="text-[10px] font-sans font-semibold text-slate-700">AI Draft Specific</span>
                      <svg className={`w-3 h-3 text-slate-600 transition-transform ${expandedKBSections.toolSpecific ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {expandedKBSections.toolSpecific && (
                      <div className="px-2 py-1.5 bg-white text-[9px] font-sans text-slate-600 space-y-0.5">
                        <div>• Return & Refund Policy</div>
                        <div>• Order Processing & Shipping</div>
                        <div>• Draft Decision Rules</div>
                      </div>
                    )}
                  </div>

                  {/* View Full Details Link */}
                  {draftData?.knowledgeBase && (
                    <button
                      onClick={() => {
                        setShowKBTab(false);
                        setShowKnowledgeBase(true);
                      }}
                      className="w-full px-2 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-[10px] font-sans font-medium text-slate-700 transition-colors flex items-center justify-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      View Full KB
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Summarize Button with KB Info */}
          <div className="relative">
            <button
              onClick={() => {/* TODO: Implement summarize */}}
              disabled={!selectedConversation}
              className="w-full px-3 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-md transition-colors text-sm font-sans font-medium disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-between shadow-sm"
            >
              <span>Summarize</span>
              {/* Info Icon */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSummarizeKBTab(!showSummarizeKBTab);
                }}
                className="p-0.5 hover:bg-white/20 rounded transition-colors cursor-pointer"
                title="View Knowledge Base"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowSummarizeKBTab(!showSummarizeKBTab);
                  }
                }}
              >
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
            </button>

            {/* Expandable Knowledge Base Tab for Summarize */}
            {showSummarizeKBTab && (
              <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-white border border-slate-300 rounded shadow-lg overflow-hidden">
                {/* Header */}
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    <span className="text-xs font-sans font-semibold text-slate-700">Summarize Knowledge Base</span>
                  </div>
                  <button
                    onClick={() => setShowSummarizeKBTab(false)}
                    className="p-0.5 hover:bg-slate-200 rounded transition-colors"
                    title="Close"
                  >
                    <svg className="w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Content */}
                <div className="max-h-64 overflow-y-auto p-2 space-y-1.5">
                  {/* General Guidelines */}
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <button
                      onClick={() => setExpandedKBSections(prev => ({ ...prev, general: !prev.general }))}
                      className="w-full px-2 py-1.5 bg-slate-50 hover:bg-slate-100 transition-colors flex items-center justify-between text-left"
                    >
                      <span className="text-[10px] font-sans font-semibold text-slate-700">General Guidelines</span>
                      <svg className={`w-3 h-3 text-slate-600 transition-transform ${expandedKBSections.general ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {expandedKBSections.general && (
                      <div className="px-2 py-1.5 bg-white text-[9px] font-sans text-slate-600 space-y-0.5">
                        <div>• Email Classification Tags</div>
                        <div>• Link Policy</div>
                        <div>• Summary Requirements</div>
                      </div>
                    )}
                  </div>

                  {/* Summarize Tool Specific */}
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <button
                      onClick={() => setExpandedKBSections(prev => ({ ...prev, toolSpecific: !prev.toolSpecific }))}
                      className="w-full px-2 py-1.5 bg-slate-50 hover:bg-slate-100 transition-colors flex items-center justify-between text-left"
                    >
                      <span className="text-[10px] font-sans font-semibold text-slate-700">Summarize Specific</span>
                      <svg className={`w-3 h-3 text-slate-600 transition-transform ${expandedKBSections.toolSpecific ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {expandedKBSections.toolSpecific && (
                      <div className="px-2 py-1.5 bg-white text-[9px] font-sans text-slate-600 space-y-0.5">
                        <div>• Conversation Context Analysis</div>
                        <div>• Key Points Extraction</div>
                        <div>• Action Items Identification</div>
                        <div>• Customer Sentiment</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* View All Related Conversations Modal */}
    {showAllHistory && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-background border border-border rounded-lg w-[600px] max-h-[80vh] flex flex-col shadow-xl">
          <div className="px-6 py-4 border-b border-border shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-sans font-bold text-foreground">All Related Conversations</h2>
              <button
                onClick={() => setShowAllHistory(false)}
                className="text-muted-foreground hover:text-foreground transition-colors text-xl"
              >
                ✕
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowNeedsReplyOnly(!showNeedsReplyOnly)}
                className={`px-3 py-1.5 rounded text-xs font-sans font-medium transition-colors ${
                  showNeedsReplyOnly
                    ? "bg-orange-100 text-orange-700 border border-orange-200"
                    : "bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                📩 Needs Reply {showNeedsReplyOnly ? '✓' : ''}
              </button>
              <span className="text-xs font-sans text-muted-foreground">
                Showing {filteredHistory.length} of {history.length} conversations
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {loadingHistory ? (
              <>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="w-full p-4 border border-border bg-background/50 animate-pulse rounded-lg">
                    <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </div>
                ))}
              </>
            ) : filteredHistory.length > 0 ? (
              filteredHistory.map((conv) => (
                <div
                  key={conv.id}
                  className="w-full p-4 border border-border bg-background rounded-lg"
                >
                  <p className="text-sm font-sans font-semibold text-foreground mb-1">
                    {conv.subject}
                  </p>
                  <p className="text-xs font-sans text-muted-foreground mb-3">
                    {new Date(conv.lastMessageAt).toLocaleDateString()} • {conv.messages.length} messages
                  </p>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        try {
                          // Fetch and select the conversation (handles adding it to the list if needed)
                          await fetchAndSelectConversation(conv.id);
                          // Close the modal
                          setShowAllHistory(false);
                        } catch (error) {
                          console.error('Error opening conversation:', error);
                          alert('Failed to open conversation. Please try again.');
                        }
                      }}
                      className="flex-1 px-3 py-2 text-xs font-sans font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition-colors flex items-center justify-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      <span>Open</span>
                    </button>

                    <button
                      onClick={async () => {
                        try {
                          // Mark conversation as archived (resolved)
                          const updateResponse = await fetch(`/api/conversations/${conv.id}/archive`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({}),
                          });

                          if (!updateResponse.ok) {
                            throw new Error('Failed to mark as resolved');
                          }

                          // Remove from history list immediately for instant feedback
                          setHistory(prevHistory => prevHistory.filter((c: ConversationHistory) => c.id !== conv.id));

                          // Refresh conversations list in the background
                          await refreshConversations();
                        } catch (error) {
                          console.error('Failed to mark as resolved:', error);
                          alert('Failed to mark conversation as resolved. Please try again.');
                        }
                      }}
                      className="flex-1 px-3 py-2 text-xs font-sans font-medium text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 rounded transition-colors flex items-center justify-center gap-1.5"
                      title="Mark as Resolved"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Resolve</span>
                    </button>

                    <button
                      onClick={async () => {
                        try {
                          // Add non-customer-support tag to conversation
                          const currentTags = conv.tags || [];
                          const updatedTags = [...currentTags, "non-customer-support"];

                          const updateResponse = await fetch(`/api/conversations/${conv.id}/tags`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ tags: updatedTags }),
                          });

                          if (!updateResponse.ok) {
                            throw new Error('Failed to mark as non-support');
                          }

                          // Remove from history list immediately for instant feedback
                          setHistory(prevHistory => prevHistory.filter((c: ConversationHistory) => c.id !== conv.id));

                          // Refresh conversations list in the background
                          await refreshConversations();
                        } catch (error) {
                          console.error('Failed to mark as non-support:', error);
                          alert('Failed to mark conversation as non-support. Please try again.');
                        }
                      }}
                      className="flex-1 px-3 py-2 text-xs font-sans font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded transition-colors flex items-center justify-center gap-1.5"
                      title="Mark as Non-Support"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      <span>Non-CS</span>
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center">
                <p className="text-sm font-sans text-muted-foreground">No related conversations found</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    {/* Email Composer Modal */}
    {showEmailComposer && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-background border border-border rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl ml-[384px]">
          {/* Header */}
          <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0 bg-gradient-to-r from-green-500 to-green-600">
            <h2 className="text-lg font-sans font-bold text-white flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Compose Email
            </h2>
            <button
              onClick={() => closeEmailComposer()}
              className="text-white hover:text-gray-200 transition-colors text-xl"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* To Field */}
            <div>
              <label className="block text-sm font-sans font-semibold text-foreground mb-2">To</label>
              <input
                type="email"
                value={composerTo}
                onChange={(e) => setComposerTo(e.target.value)}
                placeholder="recipient@example.com"
                className="w-full px-4 py-2 font-sans bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-foreground"
              />
            </div>

            {/* Subject Field */}
            <div>
              <label className="block text-sm font-sans font-semibold text-foreground mb-2">Subject</label>
              <input
                type="text"
                value={composerSubject}
                onChange={(e) => setComposerSubject(e.target.value)}
                placeholder="Email subject"
                className="w-full px-4 py-2 font-sans bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-foreground"
              />
            </div>

            {/* Message Body */}
            <div>
              <label className="block text-sm font-sans font-semibold text-foreground mb-2">Message</label>
              <div
                ref={composerBodyRef}
                contentEditable
                onInput={(e) => {
                  setComposerBody(e.currentTarget.textContent || "");
                }}
                onKeyDown={(e) => {
                  // Handle Enter key to insert newlines properly
                  if (e.key === 'Enter') {
                    e.preventDefault();

                    const selection = window.getSelection();
                    if (!selection?.rangeCount) return;

                    const range = selection.getRangeAt(0);
                    const textNode = document.createTextNode('\n');
                    range.insertNode(textNode);

                    // Move cursor after the newline
                    range.setStartAfter(textNode);
                    range.setEndAfter(textNode);
                    selection.removeAllRanges();
                    selection.addRange(range);

                    // Update state
                    setComposerBody(e.currentTarget.textContent || "");
                  }
                }}
                onPaste={(e) => {
                  // Prevent default paste to avoid unwanted HTML formatting
                  e.preventDefault();

                  // Get plain text from clipboard
                  const text = e.clipboardData?.getData('text/plain') || '';

                  // Insert plain text at cursor position
                  const selection = window.getSelection();
                  if (!selection?.rangeCount) return;

                  selection.deleteFromDocument();
                  const range = selection.getRangeAt(0);
                  const textNode = document.createTextNode(text);
                  range.insertNode(textNode);

                  // Move cursor to end of inserted text
                  range.setStartAfter(textNode);
                  range.setEndAfter(textNode);
                  selection.removeAllRanges();
                  selection.addRange(range);

                  // Update state
                  setComposerBody(e.currentTarget.textContent || "");
                }}
                data-placeholder="Type your message here..."
                className="w-full min-h-[300px] px-4 py-3 font-sans bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-slate-900 overflow-y-auto empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 empty:before:pointer-events-none"
                style={{
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word'
                }}
              />
            </div>

            {/* Attachments */}
            <div>
              <label className="block text-sm font-sans font-semibold text-foreground mb-2">Attachments</label>
              <div className="space-y-2">
                {composerAttachments.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg border border-border">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                      </svg>
                      <div>
                        <p className="text-sm font-sans font-medium text-foreground">{file.name}</p>
                        <p className="text-xs font-sans text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeAttachment(index)}
                      className="p-1 hover:bg-background rounded transition-colors"
                      title="Remove attachment"
                    >
                      <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}

                <label className="inline-flex items-center gap-2 px-4 py-2 bg-muted hover:bg-accent border border-border rounded-lg cursor-pointer transition-colors">
                  <svg className="w-5 h-5 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <span className="text-sm font-sans font-medium text-foreground">Add Attachment</span>
                  <input
                    type="file"
                    multiple
                    onChange={handleAttachmentChange}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between bg-secondary/30">
            <button
              onClick={() => closeEmailComposer()}
              className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm font-sans font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSendComposerEmail}
              disabled={sendingEmail || !composerTo.trim() || !composerBody.trim()}
              className="px-6 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg text-sm font-sans font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {sendingEmail ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  Sending...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Send Email
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Refund Modal */}
    {showRefundModal && refundOrder && (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-white border border-slate-300 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-300 flex items-center justify-between shrink-0 bg-slate-900">
            <h2 className="text-base font-sans font-semibold text-white">
              Process Refund - {refundOrder.name}
            </h2>
            <button
              onClick={() => setShowRefundModal(false)}
              className="text-white/80 hover:text-white transition-colors text-lg font-bold"
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white">
            {/* Order Summary */}
            <div className="border border-slate-300 bg-slate-50">
              <div className="px-4 py-2 border-b border-slate-300 bg-slate-100">
                <h3 className="text-xs font-sans font-bold text-slate-900 uppercase tracking-wide">Order Summary</h3>
              </div>
              <div className="p-4 space-y-2 text-sm font-sans text-slate-800 bg-white">
                <div className="flex justify-between">
                  <span>Order Total:</span>
                  <span className="font-bold text-slate-900">${parseFloat(refundOrder.total_price).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax:</span>
                  <span className="text-slate-900">${parseFloat(refundOrder.total_tax).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className="font-semibold text-slate-900 uppercase text-xs">{refundOrder.financial_status}</span>
                </div>
              </div>
            </div>

            {/* Refund Mode Switcher */}
            <div>
              <h3 className="text-xs font-sans font-bold text-slate-900 uppercase tracking-wide mb-3">Refund Type</h3>
              <div className="grid grid-cols-2 gap-px bg-slate-300">
                <button
                  onClick={() => {
                    setRefundMode('simple');
                    setSelectedLineItems(new Map());
                  }}
                  className={`px-4 py-3 text-sm font-sans font-semibold transition-colors ${
                    refundMode === 'simple'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  Simple Refund
                </button>
                <button
                  onClick={() => setRefundMode('items')}
                  className={`px-4 py-3 text-sm font-sans font-semibold transition-colors ${
                    refundMode === 'items'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  Refund by Items
                </button>
              </div>
            </div>

            {/* Line Items Selection (Items Mode) */}
            {refundMode === 'items' && (
              <div>
                <h3 className="text-xs font-sans font-bold text-slate-900 uppercase tracking-wide mb-3">Select Items to Refund</h3>
                <div className="space-y-px">
                  {refundOrder.line_items?.map((item: any) => {
                    const isSelected = selectedLineItems.has(item.id);
                    const selectedItem = selectedLineItems.get(item.id);
                    const maxQuantity = item.quantity;

                    return (
                      <div
                        key={item.id}
                        className={`border border-slate-300 p-4 transition-all ${
                          isSelected
                            ? 'bg-slate-100 border-l-4 border-l-slate-900'
                            : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleLineItem(item.id, maxQuantity)}
                            className="w-4 h-4 text-slate-900 mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-sans font-semibold text-slate-900 truncate">
                                  {item.name}
                                </p>
                                <p className="text-xs font-sans text-slate-600">
                                  ${parseFloat(item.price).toFixed(2)} each
                                </p>
                              </div>
                              <span className="text-sm font-sans font-bold text-slate-900 whitespace-nowrap">
                                ${(parseFloat(item.price) * (selectedItem?.quantity || maxQuantity)).toFixed(2)}
                              </span>
                            </div>

                            {isSelected && (
                              <div className="space-y-3 pt-3 border-t border-slate-300">
                                <div className="flex items-center gap-3">
                                  <label className="text-xs font-sans font-semibold text-slate-900 uppercase tracking-wide">
                                    Quantity:
                                  </label>
                                  <input
                                    type="number"
                                    min="1"
                                    max={maxQuantity}
                                    value={selectedItem?.quantity || maxQuantity}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value);
                                      if (val >= 1 && val <= maxQuantity) {
                                        updateLineItemQuantity(item.id, val);
                                      }
                                    }}
                                    className="w-20 px-3 py-1.5 text-sm font-sans bg-white text-slate-900 border border-slate-300 focus:outline-none focus:border-slate-900"
                                  />
                                  <span className="text-xs font-sans text-slate-600">
                                    of {maxQuantity}
                                  </span>
                                </div>

                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={selectedItem?.restock || false}
                                    onChange={() => toggleLineItemRestock(item.id)}
                                    className="w-4 h-4 text-slate-900"
                                  />
                                  <span className="text-xs font-sans font-semibold text-slate-900">
                                    Restock this item
                                  </span>
                                </label>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Refund Amount Selection (Simple Mode) */}
            {refundMode === 'simple' && (
              <div>
                <h3 className="text-xs font-sans font-bold text-slate-900 uppercase tracking-wide mb-3">Select Refund Amount</h3>

              {/* Preset Options */}
              <div className="space-y-px">
                <label className={`flex items-center justify-between p-4 border-l-4 cursor-pointer transition-all ${
                  refundType === 'preset' && refundPreset === 80
                    ? 'border-l-slate-900 bg-slate-100'
                    : 'border-l-transparent bg-white hover:bg-slate-50 border border-slate-300'
                }`}>
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="refundType"
                      checked={refundType === 'preset' && refundPreset === 80}
                      onChange={() => {
                        setRefundType('preset');
                        setRefundPreset(80);
                      }}
                      className="w-4 h-4 text-slate-900"
                    />
                    <div>
                      <p className="text-sm font-sans font-semibold text-slate-900">80% Refund</p>
                      <p className="text-xs font-sans text-slate-600">Majority refund</p>
                    </div>
                  </div>
                  <span className="text-base font-sans font-bold text-slate-900">
                    ${(parseFloat(refundOrder.total_price) * 0.80).toFixed(2)}
                  </span>
                </label>

                <label className={`flex items-center justify-between p-4 border-l-4 cursor-pointer transition-all ${
                  refundType === 'preset' && refundPreset === 50
                    ? 'border-l-slate-900 bg-slate-100'
                    : 'border-l-transparent bg-white hover:bg-slate-50 border border-slate-300'
                }`}>
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="refundType"
                      checked={refundType === 'preset' && refundPreset === 50}
                      onChange={() => {
                        setRefundType('preset');
                        setRefundPreset(50);
                      }}
                      className="w-4 h-4 text-slate-900"
                    />
                    <div>
                      <p className="text-sm font-sans font-semibold text-slate-900">50% Refund</p>
                      <p className="text-xs font-sans text-slate-600">Half refund</p>
                    </div>
                  </div>
                  <span className="text-base font-sans font-bold text-slate-900">
                    ${(parseFloat(refundOrder.total_price) * 0.50).toFixed(2)}
                  </span>
                </label>

                <label className={`flex items-center justify-between p-4 border-l-4 cursor-pointer transition-all ${
                  refundType === 'full'
                    ? 'border-l-slate-900 bg-slate-100'
                    : 'border-l-transparent bg-white hover:bg-slate-50 border border-slate-300'
                }`}>
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="refundType"
                      checked={refundType === 'full'}
                      onChange={() => setRefundType('full')}
                      className="w-4 h-4 text-slate-900"
                    />
                    <div>
                      <p className="text-sm font-sans font-semibold text-slate-900">Full Refund</p>
                      <p className="text-xs font-sans text-slate-600">Complete refund</p>
                    </div>
                  </div>
                  <span className="text-base font-sans font-bold text-slate-900">
                    ${parseFloat(refundOrder.total_price).toFixed(2)}
                  </span>
                </label>
              </div>

              {/* Custom Percentage */}
              <div className="border-t border-slate-300 pt-4 mt-4">
                <label className={`flex items-center gap-3 mb-3`}>
                  <input
                    type="radio"
                    name="refundType"
                    checked={refundType === 'percentage'}
                    onChange={() => setRefundType('percentage')}
                    className="w-4 h-4 text-slate-900"
                  />
                  <span className="text-xs font-sans font-bold text-slate-900 uppercase tracking-wide">Custom Percentage</span>
                </label>
                <div className="ml-7 flex items-center gap-2">
                  <input
                    type="number"
                    value={refundCustomPercentage}
                    onChange={(e) => {
                      setRefundCustomPercentage(e.target.value);
                      setRefundType('percentage');
                    }}
                    onFocus={() => setRefundType('percentage')}
                    placeholder="0"
                    min="0"
                    max="100"
                    className="w-20 px-3 py-2 text-sm font-sans bg-white text-slate-900 border border-slate-300 focus:outline-none focus:border-slate-900"
                  />
                  <span className="text-sm font-sans text-slate-900">%</span>
                  <span className="text-sm font-sans text-slate-600">
                    = ${(parseFloat(refundOrder.total_price) * (parseFloat(refundCustomPercentage) || 0) / 100).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Custom Dollar Amount */}
              <div className="border-t border-slate-300 pt-4 mt-4">
                <label className={`flex items-center gap-3 mb-3`}>
                  <input
                    type="radio"
                    name="refundType"
                    checked={refundType === 'dollar'}
                    onChange={() => setRefundType('dollar')}
                    className="w-4 h-4 text-slate-900"
                  />
                  <span className="text-xs font-sans font-bold text-slate-900 uppercase tracking-wide">Custom Dollar Amount</span>
                </label>
                <div className="ml-7 flex items-center gap-2">
                  <span className="text-sm font-sans text-slate-900">$</span>
                  <input
                    type="number"
                    value={refundCustomDollar}
                    onChange={(e) => {
                      setRefundCustomDollar(e.target.value);
                      setRefundType('dollar');
                    }}
                    onFocus={() => setRefundType('dollar')}
                    placeholder="0.00"
                    min="0"
                    max={parseFloat(refundOrder.total_price)}
                    step="0.01"
                    className="w-28 px-3 py-2 text-sm font-sans bg-white text-slate-900 border border-slate-300 focus:outline-none focus:border-slate-900"
                  />
                  <span className="text-xs font-sans text-slate-600">
                    (Max: ${parseFloat(refundOrder.total_price).toFixed(2)})
                  </span>
                </div>
              </div>
            </div>
            )}

            {/* Refund Calculation Display */}
            <div className="bg-slate-900 border border-slate-900 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-sans font-semibold text-white uppercase tracking-wide">Total Refund Amount:</span>
                <span className="text-2xl font-sans font-bold text-white">
                  ${calculateRefundAmount().toFixed(2)}
                </span>
              </div>
            </div>

            {/* Refund Reason */}
            <div>
              <label className="block text-xs font-sans font-bold text-slate-900 uppercase tracking-wide mb-2">
                Refund Reason (Optional)
              </label>
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Enter reason for refund..."
                rows={3}
                className="w-full px-4 py-3 text-sm font-sans bg-white text-slate-900 border border-slate-300 focus:outline-none focus:border-slate-900 resize-none"
              />
            </div>

            {/* Options */}
            <div className="space-y-px">
              <label className="flex items-center gap-3 p-4 bg-white border border-slate-300 cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  checked={refundNotifyCustomer}
                  onChange={(e) => setRefundNotifyCustomer(e.target.checked)}
                  className="w-4 h-4 text-slate-900"
                />
                <div>
                  <p className="text-sm font-sans font-semibold text-slate-900">Notify Customer</p>
                  <p className="text-xs font-sans text-slate-600">Send refund confirmation email</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-4 bg-white border border-slate-300 cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  checked={refundRestock}
                  onChange={(e) => setRefundRestock(e.target.checked)}
                  className="w-4 h-4 text-slate-900"
                />
                <div>
                  <p className="text-sm font-sans font-semibold text-slate-900">Restock Items</p>
                  <p className="text-xs font-sans text-slate-600">Return items to inventory</p>
                </div>
              </label>
            </div>

            {/* Confirmation Warning */}
            {refundConfirmation && (
              <div className="bg-amber-50 border-l-4 border-l-amber-500 border border-amber-200 p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h4 className="text-sm font-sans font-bold text-amber-900 mb-1 uppercase tracking-wide">Confirm Refund</h4>
                    <p className="text-sm font-sans text-amber-800 mb-2">
                      You are about to refund <strong>${calculateRefundAmount().toFixed(2)}</strong> to the customer.
                      This action cannot be undone.
                    </p>
                    <p className="text-sm font-sans text-amber-800">
                      Click &quot;Process Refund&quot; again to confirm.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-end gap-3 bg-slate-50">
            <button
              onClick={() => setShowRefundModal(false)}
              disabled={processingRefund}
              className="px-5 py-2.5 border border-border text-slate-900 text-sm font-sans font-semibold hover:bg-background transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleProcessRefund}
              disabled={processingRefund || calculateRefundAmount() <= 0}
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-sans font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {processingRefund ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  Processing...
                </>
              ) : refundConfirmation ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Confirm Refund
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                  Process Refund
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* 17track Tracking Modal */}
    {showTrackingModal && (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-white border border-slate-300 w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-300 flex items-center justify-between shrink-0 bg-gradient-to-r from-indigo-600 to-purple-600">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <h2 className="text-base font-sans font-semibold text-white">
                Package Tracking
              </h2>
            </div>
            <button
              onClick={() => {
                setShowTrackingModal(false);
                setTrackingData(null);
                setTrackingError(null);
              }}
              className="text-white/80 hover:text-white transition-colors text-lg font-bold"
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white">
            {loadingTracking && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent mb-4"></div>
                <p className="text-sm font-sans text-slate-600">Fetching tracking information...</p>
              </div>
            )}

            {trackingError && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-sm font-sans font-semibold text-yellow-900">Tracking Issue</p>
                    <p className="text-sm font-sans text-yellow-800 mt-1">{trackingError}</p>
                  </div>
                </div>
              </div>
            )}

            {!loadingTracking && !trackingError && trackingData && (
              <div className="space-y-6">
                {/* Tracking Summary */}
                {trackingData.data && trackingData.data.accepted && trackingData.data.accepted.length > 0 && (
                  <div className="border border-slate-300 bg-slate-50">
                    <div className="px-4 py-3 border-b border-slate-300 bg-slate-100">
                      <h3 className="text-xs font-sans font-bold text-slate-900 uppercase tracking-wide">Tracking Details</h3>
                    </div>
                    <div className="p-4 space-y-3">
                      {trackingData.data.accepted.map((track: any, index: number) => (
                        <div key={index}>
                          <div className="grid grid-cols-2 gap-4 text-sm font-sans">
                            <div>
                              <span className="text-slate-600">Tracking Number:</span>
                              <p className="font-mono font-semibold text-slate-900 mt-1">{track.number}</p>
                            </div>
                            {track.track_info && (
                              <>
                                {track.track_info.latest_status && (
                                  <div>
                                    <span className="text-slate-600">Status:</span>
                                    <p className="font-semibold text-slate-900 mt-1">
                                      {track.track_info.latest_status.status || 'In Transit'}
                                    </p>
                                  </div>
                                )}
                                {track.track_info.shipping_info && (
                                  <>
                                    {track.track_info.shipping_info.shipper_address && (
                                      <div>
                                        <span className="text-slate-600">From:</span>
                                        <p className="font-semibold text-slate-900 mt-1">
                                          {track.track_info.shipping_info.shipper_address.country || 'Unknown'}
                                        </p>
                                      </div>
                                    )}
                                    {track.track_info.shipping_info.recipient_address && (
                                      <div>
                                        <span className="text-slate-600">To:</span>
                                        <p className="font-semibold text-slate-900 mt-1">
                                          {track.track_info.shipping_info.recipient_address.country || 'Unknown'}
                                        </p>
                                      </div>
                                    )}
                                  </>
                                )}
                              </>
                            )}
                          </div>

                          {/* Tracking Timeline */}
                          {track.track_info && track.track_info.tracking && track.track_info.tracking.providers && (
                            <div className="mt-6">
                              <h4 className="text-xs font-sans font-bold text-slate-900 uppercase tracking-wide mb-4">Tracking History</h4>
                              <div className="space-y-3">
                                {track.track_info.tracking.providers.map((provider: any, pIndex: number) => (
                                  <div key={pIndex}>
                                    {provider.events && provider.events.map((event: any, eIndex: number) => (
                                      <div key={eIndex} className="flex gap-4 pb-4 border-b border-slate-200 last:border-0">
                                        <div className="flex flex-col items-center">
                                          <div className="w-3 h-3 rounded-full bg-indigo-600 mt-1"></div>
                                          {eIndex < (provider.events?.length || 0) - 1 && (
                                            <div className="w-0.5 h-full bg-slate-300 my-1"></div>
                                          )}
                                        </div>
                                        <div className="flex-1 pb-2">
                                          <p className="text-sm font-sans font-semibold text-slate-900">
                                            {event.description || event.stage || 'Package Update'}
                                          </p>
                                          {event.location && (
                                            <p className="text-xs font-sans text-slate-600 mt-1">
                                              {event.location}
                                            </p>
                                          )}
                                          {event.time_iso && (
                                            <p className="text-xs font-sans text-slate-500 mt-1">
                                              {new Date(event.time_iso).toLocaleString()}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No tracking data available */}
                {(!trackingData.data || !trackingData.data.accepted || trackingData.data.accepted.length === 0) && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <div>
                        <p className="text-sm font-sans font-semibold text-yellow-900">No Tracking Information</p>
                        <p className="text-sm font-sans text-yellow-700 mt-1">
                          Tracking information is not yet available. Please try again later.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-300 shrink-0 flex items-center justify-end gap-3 bg-slate-50">
            <button
              onClick={() => {
                setShowTrackingModal(false);
                setTrackingData(null);
                setTrackingError(null);
              }}
              className="px-5 py-2.5 border border-slate-300 text-slate-900 text-sm font-sans font-semibold hover:bg-slate-100 transition-colors"
            >
              Close
            </button>
            {trackingData && trackingData.data && trackingData.data.accepted && trackingData.data.accepted[0] && (
              <a
                href={`https://t.17track.net/en#nums=${trackingData.data.accepted[0].number}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-sans font-semibold transition-colors flex items-center gap-2"
              >
                View on 17track
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </div>
        </div>
      </div>
    )}

    {/* AI Draft Popup Modal */}
    {showDraftPopup && !draftMinimized && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-white border border-slate-200 shadow-2xl w-[900px] max-h-[85vh] flex flex-col rounded-xl overflow-hidden">
          {/* Header */}
          <div className="px-8 py-5 bg-gradient-to-r from-purple-50 via-pink-50 to-purple-50 border-b border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-md">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-sans font-bold text-slate-900 text-base">
                    AI Draft Assistant
                  </h3>
                  {draftData?.knowledgeBase && (
                    <button
                      onClick={() => setShowKnowledgeBase(true)}
                      className="p-1 hover:bg-white/50 rounded-full transition-colors group"
                      title="View Knowledge Base"
                    >
                      <svg className="w-4 h-4 text-purple-600 group-hover:text-purple-700" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>
                {draftData?.tags && draftData.tags.length > 0 && (
                  <div className="flex items-center gap-2 mt-1">
                    {draftData.tags.slice(0, 3).map((tag: string) => (
                      <span key={tag} className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-sans font-medium rounded-md">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => setDraftMinimized(true)}
              className="p-2 hover:bg-white/50 rounded-lg transition-colors group"
              title="Minimize"
            >
              <svg className="w-5 h-5 text-slate-500 group-hover:text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Content */}
          {!draftMinimized && (
            <div className="px-6 py-6 overflow-y-auto flex-1">
              {loadingDraft && (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent mb-4"></div>
                  <p className="text-sm font-sans text-purple-700">Analyzing email and generating draft...</p>
                </div>
              )}

              {draftError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-sm font-sans font-semibold text-red-900">Error Generating Draft</p>
                      <p className="text-sm font-sans text-red-700 mt-1">{draftError}</p>
                    </div>
                  </div>
                </div>
              )}

              {!loadingDraft && !draftError && draftData && (
                <div className="space-y-4">
                  {/* Category and Tags */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-3 py-1 bg-purple-600 text-white text-xs font-sans font-semibold rounded-full">
                      {draftData.category}
                    </span>
                    {draftData.tags?.map((tag: string) => (
                      <span key={tag} className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-sans font-semibold rounded-full border border-purple-300">
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* AI Reasoning */}
                  {draftData.reasoning && (
                    <div className="bg-white border border-purple-200 rounded-lg p-4">
                      <h4 className="text-xs font-sans font-bold text-purple-900 uppercase tracking-wide mb-2 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        AI Reasoning
                      </h4>
                      <p className="text-sm font-sans text-gray-700 whitespace-pre-wrap">{draftData.reasoning}</p>
                    </div>
                  )}

                  {/* Order Information */}
                  {draftData.orderInfo && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="text-xs font-sans font-bold text-blue-900 uppercase tracking-wide mb-2">Order Information</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm font-sans">
                        {draftData.orderInfo.orderId && (
                          <div>
                            <span className="text-blue-600">Order ID:</span>
                            <p className="font-semibold text-blue-900">{draftData.orderInfo.orderId}</p>
                          </div>
                        )}
                        {draftData.orderInfo.orderDate && (
                          <div>
                            <span className="text-blue-600">Order Date:</span>
                            <p className="font-semibold text-blue-900">{draftData.orderInfo.orderDate}</p>
                          </div>
                        )}
                        {draftData.orderInfo.deliveryDate && (
                          <div>
                            <span className="text-blue-600">Delivery Date:</span>
                            <p className="font-semibold text-blue-900">{draftData.orderInfo.deliveryDate}</p>
                          </div>
                        )}
                        {draftData.orderInfo.isWithinReturnWindow !== undefined && (
                          <div>
                            <span className="text-blue-600">Return Window:</span>
                            <p className={`font-semibold ${draftData.orderInfo.isWithinReturnWindow ? 'text-green-600' : 'text-red-600'}`}>
                              {draftData.orderInfo.isWithinReturnWindow ? 'Within 30 days ✓' : 'Expired ✗'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Draft Email or Action Steps */}
                  {draftData.shouldDraft && draftData.draft ? (
                    <div className="bg-white border-2 border-purple-300 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-sans font-bold text-purple-900 uppercase tracking-wide flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76" />
                          </svg>
                          Email Draft
                        </h4>
                        <div className="flex items-center gap-2">
                          {editingDraft ? (
                            <>
                              <button
                                onClick={() => {
                                  setDraftsByConversationId(prev => ({
                                    ...prev,
                                    [selectedConversation!.id]: {
                                      ...prev[selectedConversation!.id],
                                      draft: editedDraftText
                                    }
                                  }));
                                  setEditingDraft(false);
                                }}
                                className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-sans font-semibold rounded transition-colors"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => {
                                  setEditingDraft(false);
                                  setEditedDraftText("");
                                }}
                                className="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white text-xs font-sans font-semibold rounded transition-colors"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setEditedDraftText(draftData.draft);
                                  setEditingDraft(true);
                                }}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-sans font-semibold rounded transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => {
                                  // Set both the state and the contentEditable innerHTML
                                  if (replyEditorRef.current) {
                                    replyEditorRef.current.innerHTML = draftData.draft;
                                  }
                                  setReplyText(draftData.draft);
                                  setShowDraftPopup(false);
                                }}
                                className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-sans font-semibold rounded transition-colors"
                              >
                                Use Draft
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      {editingDraft ? (
                        <textarea
                          value={editedDraftText}
                          onChange={(e) => setEditedDraftText(e.target.value)}
                          className="w-full bg-gray-50 rounded p-4 font-sans text-sm text-gray-800 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent min-h-[200px]"
                          placeholder="Edit your draft..."
                        />
                      ) : (
                        <div className="bg-gray-50 rounded p-4 font-sans text-sm text-gray-800 whitespace-pre-wrap border border-gray-200">
                          {draftData.draft}
                        </div>
                      )}
                    </div>
                  ) : draftData.actionSteps && (Array.isArray(draftData.actionSteps) ? draftData.actionSteps.length > 0 : true) ? (
                    <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
                      <h4 className="text-xs font-sans font-bold text-yellow-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                        Action Steps for Agent
                      </h4>
                      <ol className="space-y-2">
                        {(Array.isArray(draftData.actionSteps)
                          ? draftData.actionSteps
                          : typeof draftData.actionSteps === 'string'
                            ? draftData.actionSteps.split('\n').filter((s: string) => s.trim())
                            : []
                        ).map((step: string, index: number) => (
                          <li key={index} className="flex items-start gap-3">
                            <span className="flex-shrink-0 w-6 h-6 bg-yellow-600 text-white rounded-full flex items-center justify-center text-xs font-sans font-bold">
                              {index + 1}
                            </span>
                            <p className="text-sm font-sans text-yellow-900 pt-0.5">{step}</p>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <p className="text-sm font-sans text-gray-600 italic">No draft or action steps generated.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Footer with Regenerate and Delete buttons */}
          {!loadingDraft && draftData && (
            <div className="px-8 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <button
                onClick={() => {
                  generateDraft();
                }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all font-sans text-sm font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Regenerate Draft
              </button>
              <button
                onClick={async () => {
                  if (confirm('Are you sure you want to delete this draft? This cannot be undone.')) {
                    setShowDraftPopup(false);
                    setDraftMinimized(false);
                    setDraftError(null);
                    // Delete draft for current conversation
                    if (selectedConversation?.id) {
                      // Delete from frontend state
                      setDraftsByConversationId(prev => {
                        const newDrafts = { ...prev };
                        delete newDrafts[selectedConversation.id];
                        return newDrafts;
                      });

                      // Delete from database
                      try {
                        const apiUrl = process.env.NODE_ENV === 'development'
                          ? `http://localhost:3001/conversations/${selectedConversation.id}/draft`
                          : `/api/conversations/${selectedConversation.id}/draft`;

                        await fetch(apiUrl, {
                          method: "DELETE"
                        });
                        console.log(`Deleted draft from database for conversation ${selectedConversation.id}`);
                      } catch (error) {
                        console.error("Failed to delete draft from database:", error);
                        // Don't show error to user since frontend state is already updated
                      }
                    }
                  }
                }}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-red-50 hover:border-red-300 text-slate-700 hover:text-red-700 rounded-lg transition-all font-sans text-sm font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete Draft
              </button>
            </div>
          )}
        </div>
      </div>
    )}

    {/* Knowledge Base Modal */}
    {showKnowledgeBase && draftData?.knowledgeBase && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-white border border-slate-200 shadow-2xl w-[800px] max-h-[85vh] flex flex-col rounded-xl overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 bg-gradient-to-r from-purple-50 to-blue-50 border-b border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div>
                <h3 className="font-sans font-bold text-slate-900 text-base">AI Knowledge Base</h3>
                <p className="text-xs text-slate-600 font-sans">Training data used for draft generation</p>
              </div>
            </div>
            <button
              onClick={() => setShowKnowledgeBase(false)}
              className="p-2 hover:bg-white/50 rounded-lg transition-colors group"
              title="Close"
            >
              <svg className="w-5 h-5 text-slate-500 group-hover:text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-6 overflow-y-auto flex-1 space-y-4">
            {/* Check if knowledge base is structured or plain text */}
            {typeof draftData.knowledgeBase === 'object' && draftData.knowledgeBase.general ? (
              <>
                {/* General Knowledge Base */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedKBSections(prev => ({ ...prev, general: !prev.general }))}
                    className="w-full px-4 py-3 bg-gradient-to-r from-blue-50 to-cyan-50 hover:from-blue-100 hover:to-cyan-100 transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                      </svg>
                      <span className="font-sans font-bold text-blue-900">{draftData.knowledgeBase.general.title}</span>
                    </div>
                    <svg className={`w-5 h-5 text-blue-600 transition-transform ${expandedKBSections.general ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {expandedKBSections.general && (
                    <div className="p-4 bg-white space-y-3">
                      {draftData.knowledgeBase.general.sections.map((section: any, idx: number) => (
                        <div key={idx} className="border-l-4 border-blue-400 pl-3">
                          <h4 className="text-sm font-sans font-bold text-slate-900 mb-1">{section.title}</h4>
                          <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap break-words">{section.content}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tool-Specific Knowledge Base */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedKBSections(prev => ({ ...prev, toolSpecific: !prev.toolSpecific }))}
                    className="w-full px-4 py-3 bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      <span className="font-sans font-bold text-purple-900">{draftData.knowledgeBase.toolSpecific.title}</span>
                    </div>
                    <svg className={`w-5 h-5 text-purple-600 transition-transform ${expandedKBSections.toolSpecific ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {expandedKBSections.toolSpecific && (
                    <div className="p-4 bg-white space-y-3">
                      {draftData.knowledgeBase.toolSpecific.sections.map((section: any, idx: number) => (
                        <div key={idx} className="border-l-4 border-purple-400 pl-3">
                          <h4 className="text-sm font-sans font-bold text-slate-900 mb-1">{section.title}</h4>
                          <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap break-words">{section.content}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Fallback for plain text knowledge base */
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <pre className="text-xs font-mono text-slate-800 whitespace-pre-wrap break-words">
                  {typeof draftData.knowledgeBase === 'string' ? draftData.knowledgeBase : JSON.stringify(draftData.knowledgeBase, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end shrink-0">
            <button
              onClick={() => setShowKnowledgeBase(false)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-sans text-sm font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}
