"use client";

import { useState, useEffect } from "react";
import { useConversations } from "@/lib/ConversationContext";
import { useRouter } from "next/navigation";

type ConversationHistory = {
  id: string;
  subject: string;
  lastMessageAt: string;
  messages: { direction: string }[];
};

// Aggressively sanitize email HTML to enforce consistent styling
function sanitizeEmailHtml(html: string): string {
  if (!html) return html;

  let sanitized = html;

  // Remove all <style> tags and their content (embedded CSS)
  sanitized = sanitized.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Remove all class attributes (single and double quotes)
  sanitized = sanitized.replace(/\sclass\s*=\s*"[^"]*"/gi, '');
  sanitized = sanitized.replace(/\sclass\s*=\s*'[^']*'/gi, '');

  // Remove all inline style attributes completely (single and double quotes)
  sanitized = sanitized.replace(/\sstyle\s*=\s*"[^"]*"/gi, '');
  sanitized = sanitized.replace(/\sstyle\s*=\s*'[^']*'/gi, '');

  // DON'T remove width/height from tables and images (needed for layout)
  // Only remove from text elements that break layout
  sanitized = sanitized.replace(/<(span|div|p|h1|h2|h3|h4|h5|h6)[^>]*\s(width|height)\s*=\s*"[^"]*"/gi, '<$1');
  sanitized = sanitized.replace(/<(span|div|p|h1|h2|h3|h4|h5|h6)[^>]*\s(width|height)\s*=\s*'[^']*'/gi, '<$1');

  // Remove any <font> tags but keep their content
  sanitized = sanitized.replace(/<font[^>]*>/gi, '');
  sanitized = sanitized.replace(/<\/font>/gi, '');

  return sanitized;
}

export default function ConversationView() {
  const { conversations, selectedConversation, selectConversation, refreshConversations, updateConversationOptimistic, pagination, goToPage } = useConversations();
  const router = useRouter();
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<ConversationHistory[]>([]);
  const [showHistory, setShowHistory] = useState(true);
  const [editingTags, setEditingTags] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [summaryMinimized, setSummaryMinimized] = useState(false);
  const [activeInfoTooltip, setActiveInfoTooltip] = useState<string | null>(null);
  const [navigatingUnreplied, setNavigatingUnreplied] = useState(false);

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

  // Email composer state
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [composerTo, setComposerTo] = useState("");
  const [composerSubject, setComposerSubject] = useState("");
  const [composerBody, setComposerBody] = useState("");
  const [composerAttachments, setComposerAttachments] = useState<File[]>([]);
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
    if (!replyText.trim() || !selectedConversation) return;

    setSending(true);
    try {
      const recipientEmail = getReplyToEmail();

      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          to: recipientEmail,
          body: replyText,
        }),
      });
      setReplyText("");
      // Refresh conversations to show the new message
      await refreshConversations();
    } catch (error) {
      console.error("Failed to send message:", error);
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
            const res = await fetch(`/api/conversations?page=${page}&limit=50`);
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
            const res = await fetch(`/api/conversations?page=${page}&limit=50`);
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
            const res = await fetch(`/api/conversations?page=${page}&limit=50`);
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
      // STEP 1: Check current page FIRST for oldest unreplied (instant!)
      const unrepliedOnPage = conversations.filter((conv) => {
        if (conv.tags?.includes("non-customer-support")) return false;
        if (conv.messages.length === 0) return false;
        const lastMessage = conv.messages[conv.messages.length - 1];
        return lastMessage.direction === "inbound";
      });

      const sortedUnreplied = unrepliedOnPage.sort((a, b) =>
        new Date(a.lastMessageAt).getTime() - new Date(b.lastMessageAt).getTime()
      );

      // If oldest is on current page, select it INSTANTLY
      if (sortedUnreplied.length > 0) {
        const oldestOnPage = sortedUnreplied[0];

        // Check if this is the globally oldest by calling API
        const response = await fetch(`/api/conversations/next-unreplied`);
        if (response.ok) {
          const globallyOldest = await response.json();

          // If the oldest on this page IS the globally oldest, select it instantly
          if (globallyOldest && globallyOldest.id === oldestOnPage.id) {
            selectConversation(oldestOnPage.id);
            return; // ⚡ INSTANT
          }
        }
      }

      // STEP 2: Need to find oldest across all pages - use API
      setNavigatingUnreplied(true);

      const response = await fetch(`/api/conversations/next-unreplied`);

      if (!response.ok) {
        console.error("Failed to fetch oldest unreplied");
        setNavigatingUnreplied(false);
        return;
      }

      const oldestConversation = await response.json();

      if (!oldestConversation || !oldestConversation.id) {
        alert("No unreplied emails!");
        setNavigatingUnreplied(false);
        return;
      }

      // Check if it's on current page
      const isOnCurrentPage = conversations.some(conv => conv.id === oldestConversation.id);

      if (isOnCurrentPage) {
        selectConversation(oldestConversation.id);
        setNavigatingUnreplied(false);
      } else if (pagination) {
        // Need to find which page has this conversation
        const oldestDate = new Date(oldestConversation.lastMessageAt).getTime();
        const currentPageOldest = new Date(conversations[conversations.length - 1]?.lastMessageAt || 0).getTime();
        const currentPageNewest = new Date(conversations[0]?.lastMessageAt || 0).getTime();

        let foundPage = 0;

        // Search strategy: oldest emails are usually on later pages
        if (oldestDate < currentPageOldest) {
          // Search forward through later pages (most likely)
          for (let page = pagination.page + 1; page <= pagination.totalPages; page++) {
            const res = await fetch(`/api/conversations?page=${page}&limit=50`);
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
            const res = await fetch(`/api/conversations?page=${page}&limit=50`);
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
            const res = await fetch(`/api/conversations?page=${page}&limit=50`);
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

  // Open email composer
  const openEmailComposer = (to?: string, subject?: string) => {
    // Start with empty fields unless explicitly provided
    setComposerTo(to || "");
    setComposerSubject(subject || "");
    setComposerBody("");
    setComposerAttachments([]);
    setShowEmailComposer(true);
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
    if (!composerTo.trim() || !composerBody.trim()) {
      alert("Please provide recipient email and message body");
      return;
    }

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
          body: composerBody,
        }),
      });

      if (response.ok) {
        setShowEmailComposer(false);
        setComposerTo("");
        setComposerSubject("");
        setComposerBody("");
        setComposerAttachments([]);
        await refreshConversations();
      } else {
        throw new Error("Failed to send email");
      }
    } catch (error) {
      console.error("Failed to send email:", error);
      alert("Failed to send email. Please try again.");
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
      await fetch(`/api/conversations/${selectedConversation.id}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: updatedTags }),
      });
      await refreshConversations();
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
      await fetch(`/api/conversations/${selectedConversation.id}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: newTags }),
      });
      await refreshConversations();
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
              Click "Next" to jump to unreplied emails
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
                <p className="text-sm font-sans whitespace-pre-wrap" style={{ fontWeight: 400, color: '#000000' }}>
                  {message.bodyText}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* AI Actions Block - Minimal Design */}
      <div className="border-t border-border p-4 shrink-0 bg-purple-500/5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-0.5 h-5 bg-purple-500 rounded-full"></div>
          <h3 className="text-sm font-sans font-semibold text-foreground" style={{ fontWeight: 600 }}>AI Assistant</h3>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {/* AI Action 1: Generate Summary */}
          <div className="relative">
            <button
              onClick={handleGenerateSummary}
              disabled={loadingSummary}
              className="w-full px-3 py-2 bg-background border border-border rounded-md hover:border-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between gap-1"
            >
              <span className="text-xs font-sans text-foreground" style={{ fontWeight: 400 }}>
                {loadingSummary ? "..." : "Summary"}
              </span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveInfoTooltip(activeInfoTooltip === 'summary' ? null : 'summary');
                }}
                className="text-purple-500 hover:text-purple-600 hover:scale-110 transition-all cursor-pointer p-1"
                title="Info"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </span>
            </button>
            {activeInfoTooltip === 'summary' && (
              <div className="absolute top-full left-0 right-0 mt-1 p-2 bg-purple-500 text-white text-xs rounded-md shadow-lg z-10" style={{ fontWeight: 400 }}>
                Create an intelligent summary highlighting key points, issues, and next steps
              </div>
            )}
          </div>

          {/* AI Action 2: Draft Reply */}
          <div className="relative">
            <button
              disabled
              className="w-full px-3 py-2 bg-background border border-border rounded-md opacity-40 cursor-not-allowed flex items-center justify-between gap-1"
            >
              <span className="text-xs font-sans text-foreground" style={{ fontWeight: 400 }}>Draft</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveInfoTooltip(activeInfoTooltip === 'draft' ? null : 'draft');
                }}
                className="text-muted-foreground hover:scale-110 transition-all cursor-pointer p-1"
                title="Info"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </span>
            </button>
            {activeInfoTooltip === 'draft' && (
              <div className="absolute top-full left-0 right-0 mt-1 p-2 bg-muted text-foreground text-xs rounded-md shadow-lg z-10" style={{ fontWeight: 400 }}>
                Generate context-aware reply suggestions (Coming Soon)
              </div>
            )}
          </div>

          {/* AI Action 3: Suggest Tags */}
          <div className="relative">
            <button
              disabled
              className="w-full px-3 py-2 bg-background border border-border rounded-md opacity-40 cursor-not-allowed flex items-center justify-between gap-1"
            >
              <span className="text-xs font-sans text-foreground" style={{ fontWeight: 400 }}>Tags</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveInfoTooltip(activeInfoTooltip === 'tags' ? null : 'tags');
                }}
                className="text-muted-foreground hover:scale-110 transition-all cursor-pointer p-1"
                title="Info"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </span>
            </button>
            {activeInfoTooltip === 'tags' && (
              <div className="absolute top-full left-0 right-0 mt-1 p-2 bg-muted text-foreground text-xs rounded-md shadow-lg z-10" style={{ fontWeight: 400 }}>
                Automatically categorize with intelligent tag recommendations (Coming Soon)
              </div>
            )}
          </div>

          {/* AI Action 4: Find Similar */}
          <div className="relative">
            <button
              disabled
              className="w-full px-3 py-2 bg-background border border-border rounded-md opacity-40 cursor-not-allowed flex items-center justify-between gap-1"
            >
              <span className="text-xs font-sans text-foreground" style={{ fontWeight: 400 }}>Similar</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveInfoTooltip(activeInfoTooltip === 'similar' ? null : 'similar');
                }}
                className="text-muted-foreground hover:scale-110 transition-all cursor-pointer p-1"
                title="Info"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </span>
            </button>
            {activeInfoTooltip === 'similar' && (
              <div className="absolute top-full left-0 right-0 mt-1 p-2 bg-muted text-foreground text-xs rounded-md shadow-lg z-10" style={{ fontWeight: 400 }}>
                Discover similar conversations and past solutions (Coming Soon)
              </div>
            )}
          </div>
        </div>

        {/* AI Summary Display */}
        {aiSummary && (
          <div className="mt-5 p-5 bg-purple-500/5 border border-purple-500/20 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                <h4 className="text-sm font-sans font-bold text-purple-600">AI-Generated Summary</h4>
              </div>
              <button
                onClick={() => setSummaryMinimized(!summaryMinimized)}
                className="text-xs font-sans font-medium text-purple-500 hover:text-purple-600 transition-colors px-2 py-1"
                title={summaryMinimized ? "Expand summary" : "Minimize summary"}
              >
                {summaryMinimized ? "Expand ▼" : "Minimize ▲"}
              </button>
            </div>
            {!summaryMinimized && (
              <p className="text-sm font-sans text-foreground leading-relaxed whitespace-pre-wrap">{aiSummary}</p>
            )}
          </div>
        )}
      </div>

      {/* Reply Section */}
      <div className="border-t border-border p-6 shrink-0">
        <div className="mb-4">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Type your reply..."
            className="w-full min-h-32 p-4 font-sans bg-muted rounded-lg border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
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

    {/* Right Sidebar */}
    <div className="w-80 border-l border-border bg-background flex flex-col shrink-0 overflow-hidden">
      {/* Past Conversations Section */}
      <div className="border-b border-border">
        <div className="px-6 py-4 bg-secondary/30">
          <div className="flex items-center justify-between">
            <h3 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide">Past Conversations</h3>
            <button
              onClick={() => setShowAllHistory(true)}
              className="text-xs font-sans font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              View All →
            </button>
          </div>
        </div>

        <div className="max-h-[200px] overflow-y-auto px-4 py-3 space-y-2">
          {loadingHistory ? (
            <>
              {[1, 2].map((i) => (
                <div key={i} className="w-full p-3 bg-secondary/50 animate-pulse rounded-lg">
                  <div className="h-3 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-2 bg-muted rounded w-1/2"></div>
                </div>
              ))}
            </>
          ) : history.length > 0 ? (
            history.slice(0, 3).map((conv) => (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                className="w-full text-left p-3 bg-secondary/50 hover:bg-secondary border border-transparent hover:border-primary/20 transition-all cursor-pointer rounded-lg group"
              >
                <p className="text-xs font-sans font-semibold text-foreground mb-1 truncate group-hover:text-primary transition-colors">
                  {conv.subject}
                </p>
                <p className="text-[10px] font-sans text-muted-foreground truncate">
                  {new Date(conv.lastMessageAt).toLocaleDateString()} • {conv.messages.length} messages
                </p>
              </button>
            ))
          ) : (
            <div className="p-6 text-center">
              <p className="text-xs font-sans text-muted-foreground">No past conversations</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions Section */}
      <div className="border-b border-border">
        <div className="px-6 py-4 bg-secondary/30">
          <h3 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide">Quick Actions</h3>
        </div>

        <div className="px-4 py-4 space-y-3">
          {/* Next Unreplied Button */}
          <button
            onClick={goToNextUnreplied}
            disabled={navigatingUnreplied}
            className="w-full px-4 py-3.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg transition-all shadow-sm hover:shadow-md group disabled:opacity-60 disabled:cursor-not-allowed relative"
          >
            {navigatingUnreplied && (
              <div className="absolute inset-0 bg-blue-600/50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 animate-spin text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                  />
                </svg>
                <span className="text-sm font-sans font-bold">{navigatingUnreplied ? 'Navigating...' : 'Next Unreplied'}</span>
              </div>
              <span className="text-xs font-sans font-medium opacity-80">→</span>
            </div>
          </button>

          {/* Oldest Unreplied Button */}
          <button
            onClick={goToOldestUnreplied}
            className="w-full px-4 py-3.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-lg transition-all shadow-sm hover:shadow-md group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                  />
                </svg>
                <span className="text-sm font-sans font-bold">Oldest Unreplied</span>
              </div>
              <span className="text-xs font-sans font-medium opacity-80">⏰</span>
            </div>
          </button>

          {/* Mark as Non-Support Button */}
          {!selectedConversation.tags?.includes("non-customer-support") && (
            <button
              onClick={handleMarkNonSupport}
              className="w-full px-4 py-3.5 bg-background border-2 border-red-500/20 hover:border-red-500 hover:bg-red-50 text-foreground rounded-lg transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-5 h-5 text-red-500"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
                    />
                  </svg>
                  <span className="text-sm font-sans font-bold group-hover:text-red-600">Mark as Non-Support</span>
                </div>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Shopify Section */}
      <div className="border-b border-border">
        <div className="px-6 py-4 bg-secondary/30">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide">Shopify</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAIDetectEmail}
                disabled={detectingEmail || !selectedConversation}
                className="px-3 py-1.5 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-md text-xs font-sans font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                title="Use AI to detect customer email from message"
              >
                {detectingEmail ? "Detecting..." : "AI Detect"}
              </button>
              {shopifyCustomer && (
                <span className="text-xs font-sans font-medium text-green-600">Connected</span>
              )}
            </div>
          </div>

          {/* Search for Customer */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={shopifySearchQuery}
              onChange={(e) => setShopifySearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleShopifySearch()}
              placeholder="Search by email or name..."
              className="flex-1 px-3 py-2 text-xs font-sans bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={handleShopifySearch}
              disabled={searchingShopify || !shopifySearchQuery.trim()}
              className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-xs font-sans font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {searchingShopify ? "..." : "Search"}
            </button>
          </div>
        </div>

        <div className="px-4 py-4 space-y-3 max-h-[500px] overflow-y-auto">
          {loadingShopify ? (
            <div className="p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
              <p className="text-sm font-sans text-muted-foreground">Loading Shopify data...</p>
            </div>
          ) : shopifyError ? (
            <div className="p-4 bg-muted rounded-lg text-center">
              <p className="text-sm font-sans text-muted-foreground">{shopifyError}</p>
            </div>
          ) : shopifyCustomer ? (
            <>
              {/* Customer Info */}
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-4">
                <p className="text-sm font-sans font-bold text-purple-900 mb-3">
                  {shopifyCustomer.first_name} {shopifyCustomer.last_name}
                </p>
                <div className="space-y-1.5 text-xs font-sans text-purple-700">
                  <p>Orders: {shopifyCustomer.orders_count}</p>
                  <p>Total Spent: ${parseFloat(shopifyCustomer.total_spent).toFixed(2)}</p>
                  <p className={shopifyCustomer.verified_email ? "text-green-600" : "text-red-600"}>
                    Email {shopifyCustomer.verified_email ? "Verified" : "Not Verified"}
                  </p>
                </div>
              </div>

              {/* Order List */}
              {shopifyOrders.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm font-sans font-semibold text-foreground">Recent Orders</p>
                  {shopifyOrders.slice(0, 5).map((order) => {
                    const trackingInfo = getTrackingInfo(order);
                    const { days, weeks } = getDaysSincePurchase(order.created_at);

                    return (
                      <div
                        key={order.id}
                        onClick={() => setSelectedOrder(order.id === selectedOrder?.id ? null : order)}
                        className="w-full text-left p-4 bg-background border border-border hover:border-primary rounded-lg transition-all"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-sans font-bold text-foreground">
                            {order.name}
                          </p>
                          <span className={`text-xs font-sans px-2 py-1 rounded ${
                            order.financial_status === "paid"
                              ? "bg-green-100 text-green-700"
                              : order.financial_status === "refunded"
                              ? "bg-red-100 text-red-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}>
                            {order.financial_status}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs font-sans text-muted-foreground mb-1">
                          <span>{new Date(order.created_at).toLocaleDateString()}</span>
                          <span className="font-bold text-foreground">${parseFloat(order.total_price).toFixed(2)}</span>
                        </div>

                        {/* Days/Weeks Since Purchase */}
                        <div className="text-xs font-sans text-muted-foreground">
                          {days} days ago ({weeks} {weeks === 1 ? 'week' : 'weeks'})
                        </div>

                        {/* Fulfillment Status Badge */}
                        <div className="mt-2">
                          <span className={`text-xs font-sans px-2 py-1 rounded ${
                            order.fulfillment_status === "fulfilled"
                              ? "bg-blue-100 text-blue-700"
                              : order.fulfillment_status === "partial"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                          }`}>
                            {order.fulfillment_status === "fulfilled"
                              ? "Shipped"
                              : order.fulfillment_status === "partial"
                              ? "Partially Shipped"
                              : "Unfulfilled"}
                          </span>
                        </div>

                        {/* Order Details (Expanded) */}
                        {selectedOrder?.id === order.id && (
                          <div className="mt-3 pt-3 border-t border-border space-y-3" onClick={(e) => e.stopPropagation()}>
                            {/* Tracking Information */}
                            {trackingInfo && trackingInfo.trackingNumber && (
                              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <p className="text-xs font-sans font-bold text-blue-900 mb-2">Tracking Information</p>
                                <div className="space-y-1.5 text-xs font-sans text-blue-800">
                                  <p className="flex items-center justify-between">
                                    <span>Status:</span>
                                    <span className="font-semibold">{trackingInfo.status || 'Unknown'}</span>
                                  </p>
                                  {trackingInfo.trackingCompany && (
                                    <p className="flex items-center justify-between">
                                      <span>Carrier:</span>
                                      <span className="font-semibold">{trackingInfo.trackingCompany}</span>
                                    </p>
                                  )}
                                  <div className="flex items-center justify-between gap-2">
                                    <span>Tracking #:</span>
                                    <div className="flex items-center gap-1">
                                      <span className="font-mono text-xs">{trackingInfo.trackingNumber}</span>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          copyTrackingNumber(trackingInfo.trackingNumber);
                                        }}
                                        className="p-1 hover:bg-blue-100 rounded transition-colors"
                                        title="Copy tracking number"
                                      >
                                        {copiedTrackingNumber === trackingInfo.trackingNumber ? (
                                          <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                          </svg>
                                        ) : (
                                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                          </svg>
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                  {trackingInfo.trackingUrl && (
                                    <a
                                      href={trackingInfo.trackingUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-blue-600 hover:text-blue-800 underline text-xs block mt-2"
                                    >
                                      Track Package →
                                    </a>
                                  )}
                                </div>
                              </div>
                            )}

                            <div className="text-xs font-sans space-y-1.5">
                              <p className="flex justify-between">
                                <span className="text-muted-foreground">Subtotal:</span>
                                <span className="text-foreground">${parseFloat(order.subtotal_price).toFixed(2)}</span>
                              </p>
                              <p className="flex justify-between">
                                <span className="text-muted-foreground">Tax:</span>
                                <span className="text-foreground">${parseFloat(order.total_tax).toFixed(2)}</span>
                              </p>
                              <p className="flex justify-between font-bold">
                                <span className="text-foreground">Total:</span>
                                <span className="text-foreground">${parseFloat(order.total_price).toFixed(2)}</span>
                              </p>
                            </div>

                            <div className="text-xs font-sans">
                              <p className="text-muted-foreground mb-2 font-semibold">Items:</p>
                              <div className="space-y-1.5">
                                {order.line_items.map((item: any) => (
                                  <div key={item.id} className="flex justify-between text-foreground">
                                    <span>{item.quantity}x {item.name}</span>
                                    <span>${parseFloat(item.price).toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="flex flex-col gap-2 pt-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openRefundModal(order);
                                }}
                                className="w-full px-3 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-sans font-bold rounded transition-colors"
                              >
                                Process Refund
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(`https://${process.env.NEXT_PUBLIC_SHOPIFY_STORE || 'put1rp-iq.myshopify.com'}/admin/orders/${order.id}`, '_blank');
                                }}
                                className="w-full px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white text-xs font-sans font-bold rounded transition-colors"
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
                <div className="p-4 bg-muted rounded-lg text-center">
                  <p className="text-sm font-sans text-muted-foreground">No orders found</p>
                </div>
              )}
            </>
          ) : (
            <div className="p-4 bg-muted rounded-lg text-center">
              <p className="text-sm font-sans text-muted-foreground">No Shopify customer found</p>
            </div>
          )}
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1"></div>

      {/* Compose Email Button */}
      <div className="border-t border-border p-4">
        <button
          onClick={() => openEmailComposer()}
          className="w-full px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg transition-all shadow-sm hover:shadow-md group flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-sm font-sans font-bold">Compose Email</span>
        </button>
      </div>
    </div>

    {/* View All Past Conversations Modal */}
    {showAllHistory && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-background border border-border rounded-lg w-[600px] max-h-[80vh] flex flex-col shadow-xl">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
            <h2 className="text-lg font-sans font-bold text-foreground">All Past Conversations</h2>
            <button
              onClick={() => setShowAllHistory(false)}
              className="text-muted-foreground hover:text-foreground transition-colors text-xl"
            >
              ✕
            </button>
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
            ) : history.length > 0 ? (
              history.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => {
                    selectConversation(conv.id);
                    setShowAllHistory(false);
                  }}
                  className="w-full text-left p-4 border border-border bg-background hover:border-primary hover:bg-accent/50 transition-all cursor-pointer rounded-lg"
                >
                  <p className="text-sm font-sans font-semibold text-foreground mb-1">
                    {conv.subject}
                  </p>
                  <p className="text-xs font-sans text-muted-foreground">
                    {new Date(conv.lastMessageAt).toLocaleDateString()} • {conv.messages.length} messages
                  </p>
                </button>
              ))
            ) : (
              <div className="p-8 text-center">
                <p className="text-sm font-sans text-muted-foreground">No past conversations found</p>
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
              onClick={() => setShowEmailComposer(false)}
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
              <textarea
                value={composerBody}
                onChange={(e) => setComposerBody(e.target.value)}
                placeholder="Type your message here..."
                rows={12}
                className="w-full px-4 py-3 font-sans bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-foreground resize-none"
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
              onClick={() => setShowEmailComposer(false)}
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
                      Click "Process Refund" again to confirm.
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
    </div>
  );
}
