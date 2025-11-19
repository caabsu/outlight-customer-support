"use client";

import { useState, useEffect, useRef } from "react";
import { useConversations } from "@/lib/ConversationContext";
import type { Conversation, Message } from "@/lib/ConversationContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AIAssistant from "./AIAssistant";
import DraftAssistantModal from "./DraftAssistantModal";
import { useCurrentUser } from "@/components/AuthProvider";

// --- TYPES ---
type ConversationHistory = {
  id: string;
  subject: string;
  lastMessageAt: string;
  archived?: boolean;
  tags?: string[];
  needsReply?: boolean;
  lastMessageDirection?: string;
  userTags?: string[];
  messages: {
    id: string;
    direction: string;
    bodyText?: string | null;
    bodyHtml?: string | null;
    attachments?: {
      filename?: string;
      mimeType?: string;
      size?: number;
      attachmentId?: string;
      contentId?: string;
      inline?: boolean;
      data?: string;
    }[];
  }[];
};

type AttachmentPayload = {
  filename: string;
  mimeType: string;
  size: number;
  data: string;
};

// --- HELPER FUNCTIONS ---

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function textToGmailHtml(text: string): string {
  return text
    .split('\n')
    .map(line => `<div>${escapeHtml(line) || '<br>'}</div>`)
    .join('');
}

function sanitizeEmailHtml(html: string): string {
  if (!html) return html;
  let sanitized = html;
  sanitized = sanitized.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  sanitized = sanitized.replace(/\sclass\s*=\s*"[^"]*"/gi, '');
  sanitized = sanitized.replace(/\sclass\s*=\s*'[^']*'/gi, '');
  return `<div class="gmail-email-body" style="width: 100%; overflow: hidden;">
    <style>
      .email-html-container .gmail-email-body table { max-width: 100% !important; box-sizing: border-box !important; }
      .email-html-container .gmail-email-body img { max-width: 100% !important; height: auto !important; }
      .email-html-container .gmail-email-body a { word-break: break-word !important; color: #2563eb; text-decoration: underline; }
      .email-html-container .gmail-email-body { font-family: sans-serif; color: #1e293b; }
    </style>
    ${sanitized}
  </div>`;
}

const buildAttachmentUrl = (messageId: string, index: number, inline = false) => {
  return `/api/messages/${messageId}/attachments/${index}${inline ? "?inline=true" : ""}`;
};

const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
};

const prepareAttachmentPayload = async (files: File[]): Promise<AttachmentPayload[]> => {
  if (!files || files.length === 0) return [];
  return Promise.all(
    files.map(async (file) => ({
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      data: await readFileAsBase64(file),
    }))
  );
};

function resolveInlineImages(html: string, message: Conversation["messages"][number]): string {
  if (!html || !message?.attachments || message.attachments.length === 0) return html;
  let resolvedHtml = html;
  message.attachments.forEach((att, idx) => {
    if (!att.contentId) return;
    const cid = att.contentId.replace(/[<>]/g, "");
    let src = att.data ? `data:${att.mimeType || "application/octet-stream"};base64,${att.data}` : `/api/messages/${message.id}/attachments/${idx}?inline=true`;
    const regex = new RegExp(`cid:${cid}`, "g");
    resolvedHtml = resolvedHtml.replace(regex, src);
  });
  return resolvedHtml;
}

// --- MAIN COMPONENT ---

export default function ConversationView() {
  // --- STATE & HOOKS ---
  const {
    conversations, selectedConversation, selectConversation, fetchAndSelectConversation,
    refreshConversations, updateConversationOptimistic, pagination, goToPage,
    showEmailComposer, openEmailComposer, closeEmailComposer,
    composerTo, setComposerTo, composerSubject, setComposerSubject,
    composerBody, setComposerBody, composerAttachments, setComposerAttachments,
    showArchived, setShowArchived, showStarred, excludeNonSupport, showNeedsReply,
    selectedTags, statusFilter, dateRange, showSent, currentWorkspaceId
  } = useConversations();

  const router = useRouter();
  const currentUser = useCurrentUser();
  const replyEditorRef = useRef<HTMLDivElement>(null);
  const composerBodyRef = useRef<HTMLDivElement>(null);

  // Local State
  const [replyText, setReplyText] = useState("");
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<ConversationHistory[]>([]);
  const [selectedRelatedIds, setSelectedRelatedIds] = useState<Set<string>>(new Set());
  const [mergingRelated, setMergingRelated] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [fullViewConversation, setFullViewConversation] = useState<ConversationHistory | null>(null);
  const [navigatingUnreplied, setNavigatingUnreplied] = useState(false);
  const [showNeedsReplyOnly, setShowNeedsReplyOnly] = useState(false);
  const [showCSOnly, setShowCSOnly] = useState(true);

  // Shopify State
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

  // Refund & Cancel State
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
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelOrder, setCancelOrder] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState<'customer' | 'fraud' | 'inventory' | 'declined' | 'other'>('customer');
  const [cancelNotifyCustomer, setCancelNotifyCustomer] = useState(true);
  const [cancelRefund, setCancelRefund] = useState(true);
  const [processingCancel, setProcessingCancel] = useState(false);
  const [cancelConfirmation, setCancelConfirmation] = useState(false);

  // Tracking State
  const [trackingData, setTrackingData] = useState<any>(null);
  const [loadingTracking, setLoadingTracking] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [showTrackingModal, setShowTrackingModal] = useState(false);

  // AI & Questions State
  const [showAskQuestionModal, setShowAskQuestionModal] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [questionReferencedEmail, setQuestionReferencedEmail] = useState("");
  const [submittingQuestion, setSubmittingQuestion] = useState(false);
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);
  const [showRelatedModal, setShowRelatedModal] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);

  const [rightSidebarWidth, setRightSidebarWidth] = useState(350);
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  // --- EFFECTS ---

  useEffect(() => { setReplyAttachments([]); }, [selectedConversation?.id]);
  useEffect(() => { setSelectedRelatedIds(new Set()); }, [selectedConversation?.id]);
  
  // Reset UI state on conversation change
  useEffect(() => {
    setIsDraftModalOpen(false);
    setHasDraft(false);
    if (selectedConversation?.id) {
        // Check if draft exists
        fetch(`/api/conversations/${selectedConversation.id}/draft`)
            .then(res => { if (res.ok) setHasDraft(true); })
            .catch(() => {});
    }
  }, [selectedConversation?.id]);

  // Fetch History
  useEffect(() => {
    if (selectedConversation?.id) {
      setLoadingHistory(true);
      setHistory([]);
      fetch(`/api/conversations/${selectedConversation.id}/history`)
        .then(res => res.json())
        .then(data => { setHistory(data); setLoadingHistory(false); })
        .catch(() => setLoadingHistory(false));
    } else {
      setHistory([]);
      setLoadingHistory(false);
    }
  }, [selectedConversation?.id]);

  // Fetch Shopify
  useEffect(() => {
    if (selectedConversation?.customer?.primaryEmail) {
      setLoadingShopify(true);
      setShopifyError(null);
      setShopifyCustomer(null);
      setShopifyOrders([]);
      
      const email = selectedConversation.customer.primaryEmail;
      fetch(`/api/shopify/customer?email=${encodeURIComponent(email)}`)
        .then(res => {
          if (res.status === 404) { setShopifyError("Customer not found in Shopify"); return null; }
          if (!res.ok) throw new Error("Failed to fetch customer");
          return res.json();
        })
        .then(customer => {
          if (customer) {
            setShopifyCustomer(customer);
            return fetch(`/api/shopify/customer/${customer.id}/orders`);
          }
          return null;
        })
        .then(res => res ? res.json() : null)
        .then(orders => { if (orders) setShopifyOrders(orders); setLoadingShopify(false); })
        .catch(err => { console.error(err); setShopifyError("Failed to load Shopify data"); setLoadingShopify(false); });
    } else {
      setShopifyCustomer(null);
      setLoadingShopify(false);
    }
  }, [selectedConversation?.customer?.primaryEmail]);

  // --- ACTIONS ---

  const handleSubmitQuestion = async () => {
    if (!questionText.trim() || !currentUser) return;
    setSubmittingQuestion(true);
    try {
      const response = await fetch(`${API_BASE_URL}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: questionText,
          askedBy: currentUser.id,
          referencedEmail: questionReferencedEmail || null,
          conversationId: selectedConversation?.id || null,
        }),
      });
      if (response.ok) {
        setQuestionText("");
        setQuestionReferencedEmail("");
        setShowAskQuestionModal(false);
        alert("Question submitted successfully!");
      } else {
        throw new Error("Failed to submit question");
      }
    } catch (error) {
      console.error(error);
      alert("Failed to submit question.");
    } finally {
      setSubmittingQuestion(false);
    }
  };

  const handleShopifySearch = async () => {
    if (!shopifySearchQuery.trim()) return;
    setSearchingShopify(true);
    setShopifyError(null);
    setShopifyCustomer(null);
    setShopifyOrders([]);
    setSelectedOrder(null);
    try {
      const emailResponse = await fetch(`/api/shopify/customer?email=${encodeURIComponent(shopifySearchQuery.trim())}`);
      if (emailResponse.ok) {
        const customer = await emailResponse.json();
        setShopifyCustomer(customer);
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

  const handleMarkResolved = async () => {
    if (!selectedConversation) return;
    try {
      updateConversationOptimistic(selectedConversation.id, { archived: true });
      setHistory(prevHistory => prevHistory.filter(conv => conv.id !== selectedConversation.id));
      fetch(`/api/conversations/${selectedConversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      }).catch(error => {
        console.error("Failed to mark as resolved:", error);
        refreshConversations();
      });
    } catch (error) {
      console.error("Failed to mark as resolved:", error);
    }
  };

  const handleMarkNonSupport = async () => {
    if (!selectedConversation) return;
    const currentUserTags = selectedConversation.userTags || [];
    const updatedUserTags = [...currentUserTags, "non-customer-support"].filter((tag, index, self) => self.indexOf(tag) === index);
    try {
      updateConversationOptimistic(selectedConversation.id, { userTags: updatedUserTags });
      setHistory(prevHistory => prevHistory.map(conv => conv.id === selectedConversation.id ? { ...conv, userTags: updatedUserTags } : conv));
      fetch(`/api/conversations/${selectedConversation.id}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: updatedUserTags }),
      }).catch(error => {
        console.error("Failed to mark as non-support:", error);
        refreshConversations();
      });
    } catch (error) {
      console.error("Failed to mark as non-support:", error);
    }
  };

  const handleEscalateToAdmin = async () => {
    if (!selectedConversation) return;
    const currentUserTags = selectedConversation.userTags || [];
    const updatedUserTags = [...currentUserTags, "admin"].filter((tag, index, self) => self.indexOf(tag) === index);
    try {
      updateConversationOptimistic(selectedConversation.id, { userTags: updatedUserTags });
      fetch(`/api/conversations/${selectedConversation.id}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: updatedUserTags }),
      }).catch(error => {
        console.error("Failed to escalate to admin:", error);
        refreshConversations();
      });
    } catch (error) {
      console.error("Failed to escalate to admin:", error);
    }
  };

  const toggleRelatedSelection = (conversationId: string) => {
    setSelectedRelatedIds(prev => {
      const next = new Set(prev);
      if (next.has(conversationId)) next.delete(conversationId);
      else next.add(conversationId);
      return next;
    });
  };

  const handleMergeRelatedConversations = async () => {
    if (!selectedConversation?.id || selectedRelatedIds.size === 0 || mergingRelated) return;
    const ids = Array.from(selectedRelatedIds);
    if (!window.confirm(`Merge ${ids.length} conversations?`)) return;
    setMergingRelated(true);
    try {
      const response = await fetch(`/api/conversations/${selectedConversation.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationIds: ids }),
      });
      if (!response.ok) throw new Error("Failed to merge");
      const mergedSet = new Set(ids);
      setHistory(prev => prev.filter(c => !mergedSet.has(c.id)));
      setSelectedRelatedIds(new Set());
      await fetchAndSelectConversation(selectedConversation.id);
    } catch (error) {
      alert(`Failed to merge: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setMergingRelated(false);
    }
  };

  const handleSend = async () => {
    const textContent = replyEditorRef.current?.textContent || "";
    if (!textContent.trim() || !selectedConversation) return;
    setSending(true);
    try {
      const recipientEmail = getReplyToEmail();
      const attachmentsPayload = await prepareAttachmentPayload(replyAttachments);
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          to: recipientEmail,
          body: textToGmailHtml(textContent),
          attachments: attachmentsPayload,
          userId: currentUser?.id,
        }),
      });
      if (!response.ok) throw new Error("Failed to send");
      if (replyEditorRef.current) replyEditorRef.current.innerHTML = "";
      setReplyText("");
      setReplyAttachments([]);
      setIsDraftModalOpen(false);
      await refreshConversations();
    } catch (error) {
      alert(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSending(false);
    }
  };

  const handleInsertDraft = (text: string) => {
    if (replyEditorRef.current) {
      replyEditorRef.current.innerText = text;
    }
    setReplyText(text);
    setIsDraftModalOpen(false);
  };

  // Helper for Reply-To
  const getReplyToEmail = () => {
    if (!selectedConversation) return "";
    const inboundMessages = selectedConversation.messages.filter(m => m.direction === "inbound");
    if (inboundMessages.length > 0) {
      const last = inboundMessages[inboundMessages.length - 1];
      return last.replyToEmail || last.fromEmail;
    }
    return selectedConversation.customer.primaryEmail;
  };

  const goToNextUnreplied = async () => {
    if (navigatingUnreplied) return;
    const unrepliedOnPage = conversations.filter(conv => !conv.userTags?.includes("non-customer-support") && conv.needsReply === true);
    const sortedUnreplied = unrepliedOnPage.sort((a, b) => new Date(a.lastMessageAt).getTime() - new Date(b.lastMessageAt).getTime());

    if (selectedConversation) {
      const currentIndex = sortedUnreplied.findIndex(conv => conv.id === selectedConversation.id);
      if (currentIndex >= 0 && currentIndex < sortedUnreplied.length - 1) {
        selectConversation(sortedUnreplied[currentIndex + 1].id);
        return;
      }
    } else if (sortedUnreplied.length > 0) {
      selectConversation(sortedUnreplied[0].id);
      return;
    }

    setNavigatingUnreplied(true);
    if (!currentWorkspaceId) {
      setNavigatingUnreplied(false);
      return;
    }

    try {
      const response = await fetch(`/api/conversations/next-unreplied/${selectedConversation?.id || ''}?workspaceId=${currentWorkspaceId}`);
      if (!response.ok) throw new Error("Failed to fetch next unreplied");
      const nextConversation = await response.json();
      if (!nextConversation || !nextConversation.id) {
        alert("No more unreplied emails!");
        return;
      }
      selectConversation(nextConversation.id);
    } catch (error) {
      console.error(error);
    } finally {
      setNavigatingUnreplied(false);
    }
  };

  const handleAIDetectEmail = async () => {
    if (!selectedConversation) return;
    setDetectingEmail(true);
    setShopifyError(null);
    try {
      const latestMessage = selectedConversation.messages[selectedConversation.messages.length - 1];
      const response = await fetch('/api/ai/extract-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromEmail: latestMessage.fromEmail,
          subject: selectedConversation.subject,
          emailBody: latestMessage.bodyText || latestMessage.bodyHtml || '',
        }),
      });
      if (!response.ok) throw new Error('Failed to detect email');
      const { email } = await response.json();
      if (!email || email === 'NONE') {
        setShopifyError('No customer email found');
        return;
      }
      setShopifySearchQuery(email);
      setSearchingShopify(true);
      // Trigger search immediately
      const emailResponse = await fetch(`/api/shopify/customer?email=${encodeURIComponent(email)}`);
      if (emailResponse.ok) {
        const customer = await emailResponse.json();
        setShopifyCustomer(customer);
        const ordersResponse = await fetch(`/api/shopify/customer/${customer.id}/orders`);
        if (ordersResponse.ok) {
          const orders = await ordersResponse.json();
          setShopifyOrders(orders);
        }
      } else {
        setShopifyError(`Customer not found: ${email}`);
      }
      setSearchingShopify(false);
    } catch (err) {
      console.error(err);
      setShopifyError('Failed to detect customer email');
    } finally {
      setDetectingEmail(false);
    }
  };

  const handleReplyAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setReplyAttachments(prev => [...prev, ...Array.from(e.target.files || [])]);
    }
  };
  
  // ... Reuse other handlers (handleMarkResolved, handleShopifySearch, etc) ...
  // For brevity in this rewrite, I'll focus on the UI structure. 
  // Assume all action handlers from the original file are present. 
  
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true
    });
  };
  
  const handleMarkRelatedNonSupport = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Optimistic update
    setHistory(prev => prev.map(h => h.id === id ? { ...h, userTags: [...(h.userTags || []), "non-customer-support"] } : h));
    try {
      const updatedTags = [...(history.find(h => h.id === id)?.userTags || []), "non-customer-support"];
      await fetch(`/api/conversations/${id}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: updatedTags }),
      });
    } catch (error) {
      console.error("Failed to mark related as non-support:", error);
      // Revert on error? For now just log.
    }
  };

  const handleResolveRelated = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.map(h => h.id === id ? { ...h, archived: true } : h));
    try {
       await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
    } catch (error) {
      console.error("Failed to resolve related:", error);
    }
  };

  // --- REFUND & CANCEL HANDLERS ---

  const handleRefundOrder = (order: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setRefundOrder(order);
    // Initialize line items for refund (default 0 quantity)
    const initialItems = new Map();
    order.line_items.forEach((item: any) => {
      initialItems.set(item.id, { quantity: 0, restock: true });
    });
    setSelectedLineItems(initialItems);
    setRefundMode('simple');
    setRefundType('preset');
    setShowRefundModal(true);
  };

  const calculateRefundAmount = () => {
    if (!refundOrder) return 0;
    const total = parseFloat(refundOrder.total_price);
    
    if (refundMode === 'simple') {
      if (refundType === 'full') return total;
      if (refundType === 'preset') return total * (refundPreset / 100);
      if (refundType === 'percentage') return total * (parseFloat(refundCustomPercentage) / 100);
      if (refundType === 'dollar') return parseFloat(refundCustomDollar);
    } else {
      // Item-based calculation
      let amount = 0;
      selectedLineItems.forEach((val, id) => {
        const item = refundOrder.line_items.find((i: any) => i.id === id);
        if (item) amount += parseFloat(item.price) * val.quantity;
      });
      return amount;
    }
    return 0;
  };

  const processRefund = async () => {
    if (!refundOrder) return;
    setProcessingRefund(true);
    try {
      const amount = calculateRefundAmount();
      
      // Build refund line items if in item mode
      const refundLineItems = refundMode === 'items' 
        ? Array.from(selectedLineItems.entries())
            .filter(([_, val]) => val.quantity > 0)
            .map(([id, val]) => ({
              line_item_id: id,
              quantity: val.quantity,
              restock_type: val.restock ? 'return' : 'no_restock'
            }))
        : [];

      const response = await fetch(`${API_BASE_URL}/shopify/order/${refundOrder.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amount.toFixed(2),
          currency: refundOrder.currency,
          reason: refundReason || "Customer requested refund",
          notify: refundNotifyCustomer,
          line_items: refundLineItems,
          full_refund: refundType === 'full' && refundMode === 'simple'
        })
      });

      if (!response.ok) throw new Error("Refund failed");
      
      alert(`Successfully refunded $${amount.toFixed(2)}`);
      setShowRefundModal(false);
      // Refresh order data
      if (shopifyCustomer) {
        const ordersRes = await fetch(`/api/shopify/customer/${shopifyCustomer.id}/orders`);
        if (ordersRes.ok) setShopifyOrders(await ordersRes.json());
      }
    } catch (err) {
      console.error(err);
      alert("Failed to process refund. Please check the console or try again.");
    } finally {
      setProcessingRefund(false);
    }
  };

  const handleCancelOrder = (order: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCancelOrder(order);
    setShowCancelModal(true);
  };

  const processCancel = async () => {
    if (!cancelOrder) return;
    setProcessingCancel(true);
    try {
      const response = await fetch(`${API_BASE_URL}/shopify/order/${cancelOrder.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: cancelReason,
          email: cancelNotifyCustomer,
          refund: cancelRefund
        })
      });

      if (!response.ok) throw new Error("Cancellation failed");
      
      alert("Order cancelled successfully");
      setShowCancelModal(false);
      // Refresh
      if (shopifyCustomer) {
        const ordersRes = await fetch(`/api/shopify/customer/${shopifyCustomer.id}/orders`);
        if (ordersRes.ok) setShopifyOrders(await ordersRes.json());
      }
    } catch (err) {
      console.error(err);
      alert("Failed to cancel order.");
    } finally {
      setProcessingCancel(false);
    }
  };

  // --- TRACKING HANDLER ---
  const handleTrackOrder = async (trackingNumber: string, carrier?: string) => {
    if (!trackingNumber) return;
    setLoadingTracking(true);
    setTrackingData(null);
    setTrackingError(null);
    setShowTrackingModal(true);
    
    try {
      // Try 17track first
      const response = await fetch(`${API_BASE_URL}/tracking/17track/${trackingNumber}?carrier=${carrier || ''}`);
      if (response.ok) {
        const data = await response.json();
        setTrackingData(data);
      } else {
        // Fallback or error
        setTrackingError("Tracking info unavailable via API. Please check carrier website.");
      }
    } catch (err) {
      console.error(err);
      setTrackingError("Failed to fetch tracking info");
    } finally {
      setLoadingTracking(false);
    }
  };

  // --- DERIVED STATE ---
  const filteredHistory = history.filter(h => {
    if (showCSOnly && h.userTags?.includes("non-customer-support")) return false;
    if (showNeedsReplyOnly && !h.needsReply) return false;
    return true;
  });

  // --- RENDER ---

  if (!selectedConversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-12">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-20 h-20 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-slate-900">No Conversation Selected</h2>
          <p className="text-slate-500">Select a conversation from the list to view details.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-screen overflow-hidden bg-white font-sans text-slate-900">
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        
        {/* 1. Header */}
        <header className="px-6 py-4 border-b border-slate-100 bg-white flex-shrink-0 z-10">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-snug line-clamp-2">
                {selectedConversation.subject || "(No Subject)"}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">
                    {selectedConversation.customer.name || selectedConversation.customer.primaryEmail}
                  </span>
                  <span>&lt;{selectedConversation.customer.primaryEmail}&gt;</span>
                  <span>•</span>
                  <span>{formatDate(selectedConversation.lastMessageAt)}</span>
                </div>
                {/* Tags */}
                <div className="flex gap-1 ml-2">
                   {selectedConversation.userTags?.map(tag => (
                     <span key={tag} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-medium rounded-full border border-slate-200">
                       {tag}
                     </span>
                   ))}
                </div>
              </div>
            </div>
            
            {/* Header Actions */}
            <div className="flex items-center gap-2">
               <button 
                  onClick={() => setShowAskQuestionModal(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-orange-100 text-orange-700 hover:bg-orange-200 rounded-lg text-xs font-semibold transition-colors"
               >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Ask Question
               </button>
            </div>
          </div>
        </header>

        {/* 2. Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto bg-slate-50 p-6 space-y-6">
          {selectedConversation.messages.map((message) => {
            const isOutbound = message.direction === "outbound";
            return (
              <div key={message.id} className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl shadow-sm border ${isOutbound ? "bg-blue-50 border-blue-100" : "bg-white border-slate-100"} overflow-hidden`}>
                  {/* Message Header */}
                  <div className={`px-4 py-3 border-b ${isOutbound ? "border-blue-100 bg-blue-50/50" : "border-slate-50 bg-slate-50/50"} flex items-center justify-between gap-4`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isOutbound ? "bg-blue-200 text-blue-700" : "bg-slate-200 text-slate-600"}`}>
                        {message.fromEmail[0].toUpperCase()}
                      </div>
                      <span className={`text-xs font-semibold ${isOutbound ? "text-blue-900" : "text-slate-900"}`}>
                        {message.fromEmail}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">{formatDate(message.sentAt)}</span>
                  </div>
                  
                  {/* Message Body */}
                  <div className="p-4 text-sm text-slate-800 leading-relaxed overflow-x-auto">
                     {message.bodyHtml ? (
                        <div dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(resolveInlineImages(message.bodyHtml, message)) }} />
                     ) : (
                        <p className="whitespace-pre-wrap">{message.bodyText}</p>
                     )}
                  </div>

                  {/* Attachments */}
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="px-4 pb-4 pt-2">
                      <div className="flex flex-wrap gap-2">
                        {message.attachments.map((att, idx) => (
                          <a 
                            key={idx} 
                            href={buildAttachmentUrl(message.id, idx)} 
                            target="_blank"
                            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs hover:bg-slate-50 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                            <span className="truncate max-w-[150px]">{att.filename || "Attachment"}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 3. Reply Area (Fixed Bottom) */}
        <div className="border-t border-slate-200 bg-white p-4 z-10">
          <div className="relative rounded-xl border border-slate-300 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all bg-white">
            {/* Toolbar */}
            <div className="flex items-center gap-1 p-2 border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
              <button className="p-1.5 hover:bg-slate-200 rounded text-slate-500" title="Attach File">
                <label className="cursor-pointer">
                   <input type="file" multiple className="hidden" onChange={(e) => e.target.files && setReplyAttachments([...replyAttachments, ...Array.from(e.target.files)])} />
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                </label>
              </button>
              
              <button 
                onClick={() => setIsDraftModalOpen(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ml-auto ${hasDraft ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                {hasDraft ? "Draft Ready" : "AI Draft Assistant"}
              </button>
            </div>

            {/* Editor */}
            <div 
              ref={replyEditorRef}
              contentEditable
              onInput={(e) => setReplyText(e.currentTarget.textContent || "")}
              className="min-h-[120px] max-h-[300px] p-3 overflow-y-auto outline-none text-sm text-slate-900"
              data-placeholder="Type your reply..."
            />
            
            {/* Attachments List */}
            {replyAttachments.length > 0 && (
              <div className="p-2 flex flex-wrap gap-2 border-t border-slate-50">
                 {replyAttachments.map((file, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-xs rounded border border-slate-200">
                       {file.name}
                       <button onClick={() => setReplyAttachments(prev => prev.filter((_, idx) => idx !== i))} className="hover:text-red-500">×</button>
                    </span>
                 ))}
              </div>
            )}

            {/* Footer Actions */}
            <div className="p-2 flex justify-between items-center">
               <p className="text-xs text-slate-400 pl-2">Replying to {getReplyToEmail()}</p>
               <button 
                 onClick={handleSend}
                 disabled={!replyText.trim() || sending}
                 className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm disabled:opacity-50 transition-colors"
               >
                 {sending ? "Sending..." : "Send Reply"}
               </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Right Sidebar (Resizable) */}
      <div 
        className="relative flex-shrink-0 border-l border-slate-200 bg-slate-50 flex flex-col overflow-hidden"
        style={{ width: rightSidebarWidth }}
      >
        {/* Resize Handle */}
        <div 
          className="absolute left-0 top-0 bottom-0 w-1 hover:bg-blue-400 cursor-col-resize z-20 transition-colors"
          onMouseDown={(e) => {
             const startX = e.clientX;
             const startW = rightSidebarWidth;
             const onMove = (ev: MouseEvent) => setRightSidebarWidth(Math.max(300, Math.min(600, startW + (startX - ev.clientX))));
             const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
             window.addEventListener('mousemove', onMove);
             window.addEventListener('mouseup', onUp);
          }}
        />

        {/* Sidebar Content Container - Flex Column */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
          
          {/* 1. Shopify Section (Fixed Height) */}
          <div className="h-[400px] border-b border-slate-200 flex flex-col bg-white flex-shrink-0">
             <div className="p-4 border-b border-slate-100 flex-shrink-0 bg-slate-50/50">
                 <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                    Shopify Customer
                    <button onClick={handleAIDetectEmail} disabled={detectingEmail} className="ml-auto text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded hover:bg-purple-200 disabled:opacity-50">
                       {detectingEmail ? "..." : "AI Detect"}
                    </button>
                 </h3>
             </div>
             
             <div className="flex-1 overflow-y-auto p-4">
                 {/* Manual Search */}
                 <div className="flex gap-2 mb-3">
                    <input 
                      type="text" 
                      value={shopifySearchQuery} 
                      onChange={(e) => setShopifySearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleShopifySearch()}
                      placeholder="Search..." 
                      className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                    />
                    <button 
                      onClick={handleShopifySearch}
                      disabled={searchingShopify}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-xs font-medium border border-slate-300"
                    >
                      {searchingShopify ? "..." : "Search"}
                    </button>
                 </div>
                 
                 {loadingShopify ? (
                    <div className="text-center py-8 text-slate-400 text-sm">Loading...</div>
                 ) : shopifyCustomer ? (
                    <div className="space-y-3">
                       <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                          <p className="font-semibold text-slate-900">{shopifyCustomer.first_name} {shopifyCustomer.last_name}</p>
                          <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-500">
                             <div>Orders: <span className="text-slate-900">{shopifyCustomer.orders_count}</span></div>
                             <div>Spent: <span className="text-slate-900">${shopifyCustomer.total_spent}</span></div>
                          </div>
                       </div>
                       
                       <div className="space-y-2">
                          {shopifyOrders.slice(0, 3).map(order => (
                             <div key={order.id} className="bg-white border border-slate-200 rounded-lg p-3 hover:border-blue-300 cursor-pointer transition-colors" onClick={() => setSelectedOrder(selectedOrder?.id === order.id ? null : order)}>
                                <div className="flex justify-between items-center mb-1">
                                   <span className="font-medium text-slate-900 text-xs">#{order.order_number}</span>
                                   <div className="flex gap-1">
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${order.financial_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{order.financial_status}</span>
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${order.fulfillment_status === 'fulfilled' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{order.fulfillment_status || 'unfulfilled'}</span>
                                   </div>
                                </div>
                                <div className="flex justify-between text-xs text-slate-500">
                                   <span>{new Date(order.created_at).toLocaleDateString()}</span>
                                   <span className="text-slate-900 font-medium">${order.total_price}</span>
                                </div>
                                {selectedOrder?.id === order.id && (
                                   <div className="mt-2 pt-2 border-t border-slate-100 text-xs space-y-1">
                                      {order.line_items.map((item: any) => (
                                         <div key={item.id} className="flex justify-between">
                                            <span className="truncate flex-1">{item.quantity}x {item.name}</span>
                                            <span>${item.price}</span>
                                         </div>
                                      ))}
                                      
                                      {/* Tracking Link */}
                                      {order.fulfillments?.map((f: any) => f.tracking_number && (
                                         <div key={f.id} className="flex items-center gap-2 bg-slate-50 p-1.5 rounded">
                                            <span className="text-slate-500">Tracking:</span>
                                            <button 
                                              onClick={() => handleTrackOrder(f.tracking_number, f.tracking_company)}
                                              className="text-blue-600 font-medium hover:underline truncate flex-1 text-left"
                                            >
                                              {f.tracking_number}
                                            </button>
                                         </div>
                                      ))}

                                      {/* Action Buttons */}
                                      <div className="grid grid-cols-3 gap-2 pt-1">
                                         <button 
                                            onClick={(e) => { e.stopPropagation(); window.open(`https://${process.env.NEXT_PUBLIC_SHOPIFY_STORE || 'admin.shopify.com'}/orders/${order.id}`, '_blank'); }} 
                                            className="flex items-center justify-center gap-1 px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-center font-medium text-[10px]"
                                            title="View in Shopify"
                                         >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                            View
                                         </button>
                                         <button 
                                            onClick={(e) => handleRefundOrder(order, e)}
                                            className="flex items-center justify-center gap-1 px-2 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded text-center font-medium text-[10px]"
                                            title="Process Refund"
                                         >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                                            Refund
                                         </button>
                                         <button 
                                            onClick={(e) => handleCancelOrder(order, e)}
                                            className="flex items-center justify-center gap-1 px-2 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded text-center font-medium text-[10px]"
                                            title="Cancel Order"
                                         >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                            Cancel
                                         </button>
                                      </div>
                                   </div>
                                )}
                             </div>
                          ))}
                       </div>
                    </div>
                 ) : (
                    <div className="text-center py-8">
                       <p className="text-xs text-slate-500 mb-2">No customer found.</p>
                    </div>
                 )}
             </div>
          </div>

          {/* 2. History Section (Flexible Height - Takes Remaining Space) */}
          <div className="flex-1 border-b border-slate-200 flex flex-col bg-white min-h-[200px]">
             <div className="p-4 border-b border-slate-100 flex-shrink-0 bg-slate-50/50">
                 <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        History ({filteredHistory.length})
                    </h3>
                    <button onClick={() => setShowRelatedModal(true)} className="text-[10px] text-blue-600 hover:underline">View All</button>
                 </div>
                 
                 {/* Local Filters */}
                 <div className="flex gap-2">
                    <button 
                        onClick={() => setShowCSOnly(!showCSOnly)}
                        className={`px-2 py-1 text-[10px] rounded border transition-colors ${showCSOnly ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                        Hide Non-CS
                    </button>
                    <button 
                        onClick={() => setShowNeedsReplyOnly(!showNeedsReplyOnly)}
                        className={`px-2 py-1 text-[10px] rounded border transition-colors ${showNeedsReplyOnly ? 'bg-orange-100 border-orange-200 text-orange-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                        Needs Reply
                    </button>
                 </div>
             </div>
             
             <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filteredHistory.length === 0 && !loadingHistory && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <p className="text-xs">No conversations found.</p>
                    </div>
                )}
                
                {filteredHistory.slice(0, 10).map(h => (
                   <div key={h.id} className={`group relative p-3 mb-2 bg-white border rounded-lg shadow-sm transition-all ${selectedConversation.id === h.id ? 'border-blue-400 ring-1 ring-blue-400 bg-blue-50/30' : 'border-slate-200 hover:border-blue-300 hover:shadow-md'}`}>
                      <div className="flex justify-between items-start mb-1.5 cursor-pointer" onClick={() => selectConversation(h.id)}>
                         <p className={`text-xs truncate flex-1 pr-2 cursor-pointer ${selectedConversation.id === h.id ? 'font-bold text-blue-700' : 'font-medium text-slate-900'}`}>
                            {h.subject || "(No Subject)"}
                         </p>
                         <span className="text-[10px] text-slate-400 whitespace-nowrap">{formatDate(h.lastMessageAt)}</span>
                      </div>
                      
                      <div className="flex justify-between items-center mt-1">
                         <div className="flex gap-1">
                            {h.needsReply && <span className="w-2 h-2 bg-orange-400 rounded-full" title="Needs Reply"></span>}
                            {h.userTags?.includes("non-customer-support") && <span className="text-[10px] text-gray-500 bg-gray-100 px-1 rounded">Non-CS</span>}
                            {h.archived && <span className="text-[10px] text-green-600 bg-green-50 px-1 rounded">Resolved</span>}
                         </div>
                         
                         {/* Improved Action Buttons */}
                         <div className="flex gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                            {!h.userTags?.includes("non-customer-support") && (
                                <button 
                                    onClick={(e) => handleMarkRelatedNonSupport(h.id, e)} 
                                    className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded" 
                                    title="Mark as Non-Support"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                </button>
                            )}
                            {!h.archived && (
                                <button 
                                    onClick={(e) => handleResolveRelated(h.id, e)} 
                                    className="p-1 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded" 
                                    title="Resolve"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                </button>
                            )}
                         </div>
                      </div>
                   </div>
                ))}
             </div>
          </div>

          {/* 3. Quick Actions Section (Auto Height) */}
          <div className="p-4 bg-slate-50 flex-shrink-0 border-t border-slate-200">
             <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Quick Actions</h3>
             <div className="flex flex-col space-y-2.5">
                
                {/* Mark Resolved */}
                <button 
                   onClick={handleMarkResolved} 
                   className="group flex items-center gap-3 p-2.5 bg-white border border-slate-200 hover:border-green-500 hover:bg-green-50/50 rounded-xl transition-all shadow-sm text-left"
                >
                   <div className="w-8 h-8 flex items-center justify-center bg-green-100 text-green-600 rounded-lg group-hover:bg-white transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                   </div>
                   <div>
                      <span className="block text-xs font-bold text-slate-700 group-hover:text-green-800">Mark Resolved</span>
                      <span className="block text-[10px] text-slate-400 group-hover:text-green-600/70">Archive conversation</span>
                   </div>
                </button>

                {/* Non-Support */}
                <button 
                   onClick={handleMarkNonSupport} 
                   className="group flex items-center gap-3 p-2.5 bg-white border border-slate-200 hover:border-slate-400 hover:bg-slate-50 rounded-xl transition-all shadow-sm text-left"
                >
                   <div className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-500 rounded-lg group-hover:bg-white transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                   </div>
                   <div>
                      <span className="block text-xs font-bold text-slate-700 group-hover:text-slate-900">Not Customer Support</span>
                      <span className="block text-[10px] text-slate-400 group-hover:text-slate-500">Mark this conversation</span>
                   </div>
                </button>

                {/* Escalate */}
                <button 
                   onClick={handleEscalateToAdmin} 
                   className="group flex items-center gap-3 p-2.5 bg-white border border-slate-200 hover:border-purple-500 hover:bg-purple-50/50 rounded-xl transition-all shadow-sm text-left"
                >
                   <div className="w-8 h-8 flex items-center justify-center bg-purple-100 text-purple-600 rounded-lg group-hover:bg-white transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                   </div>
                   <div>
                      <span className="block text-xs font-bold text-slate-700 group-hover:text-purple-800">Escalate to Admin</span>
                      <span className="block text-[10px] text-slate-400 group-hover:text-purple-600/70">Flag for review</span>
                   </div>
                </button>

                {/* Next Unreplied */}
                <button 
                   onClick={goToNextUnreplied} 
                   className="group flex items-center gap-3 p-2.5 bg-blue-600 border border-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md text-left"
                >
                   <div className="w-8 h-8 flex items-center justify-center bg-blue-500 text-white rounded-lg group-hover:bg-blue-600 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                   </div>
                   <div>
                      <span className="block text-xs font-bold text-white">Next Unreplied</span>
                      <span className="block text-[10px] text-blue-200">Jump to next email</span>
                   </div>
                </button>

             </div>
          </div>
        </div>
        
      </div>
      
              <DraftAssistantModal
                isOpen={isDraftModalOpen}
                onClose={() => { setIsDraftModalOpen(false); if (selectedConversation) fetch(`/api/conversations/${selectedConversation.id}/draft`).then(res => setHasDraft(res.ok)).catch(() => {}); }}
                onInsert={handleInsertDraft}
                conversationId={selectedConversation.id}
                customerName={selectedConversation.customer.name || "Customer"}
                customerEmail={selectedConversation.customer.primaryEmail}
                onDraftDeleted={() => setHasDraft(false)}
              />
      {/* Related Conversations Modal */}
      {showRelatedModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                   <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                   Related Conversations
                </h3>
                <p className="text-xs text-slate-500 mt-1">History for {selectedConversation.customer.primaryEmail}</p>
              </div>
              <button onClick={() => setShowRelatedModal(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Bulk Actions Toolbar */}
            <div className="p-3 bg-white border-b border-slate-200 flex items-center gap-3">
               <div className="flex items-center gap-2 mr-4 border-r border-slate-200 pr-4">
                  <input 
                     type="checkbox" 
                     className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                     checked={history.length > 0 && selectedRelatedIds.size === history.length}
                     onChange={(e) => {
                        if (e.target.checked) setSelectedRelatedIds(new Set(history.map(h => h.id)));
                        else setSelectedRelatedIds(new Set());
                     }}
                  />
                  <span className="text-xs font-medium text-slate-600">{selectedRelatedIds.size} Selected</span>
               </div>
               
               <button 
                  onClick={handleMergeRelatedConversations}
                  disabled={selectedRelatedIds.size < 2 || mergingRelated}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-blue-50 hover:border-blue-300 text-slate-700 rounded-lg text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
               >
                  <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                  Merge Threads
               </button>

               <button 
                  onClick={() => {
                     Array.from(selectedRelatedIds).forEach(id => handleMarkRelatedNonSupport(id, { stopPropagation: () => {} } as any));
                  }}
                  disabled={selectedRelatedIds.size === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
               >
                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                  Mark Non-CS
               </button>

               <button 
                  onClick={() => {
                     Array.from(selectedRelatedIds).forEach(id => handleResolveRelated(id, { stopPropagation: () => {} } as any));
                  }}
                  disabled={selectedRelatedIds.size === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-green-50 hover:border-green-200 text-slate-700 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
               >
                  <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Resolve
               </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-3">
               {history.map(h => (
                  <div 
                     key={h.id} 
                     className={`flex items-start gap-3 p-4 bg-white border rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer ${selectedRelatedIds.has(h.id) ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50/10' : 'border-slate-200'}`}
                     onClick={() => toggleRelatedSelection(h.id)}
                  >
                     <input 
                        type="checkbox" 
                        checked={selectedRelatedIds.has(h.id)}
                        onChange={() => toggleRelatedSelection(h.id)}
                        className="mt-1 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
                     />
                     
                     <div className="flex-1 min-w-0" onClick={(e) => { e.stopPropagation(); selectConversation(h.id); setShowRelatedModal(false); }}>
                        <div className="flex justify-between items-start mb-1">
                           <h4 className={`text-sm font-semibold truncate pr-4 ${h.id === selectedConversation.id ? 'text-blue-600' : 'text-slate-900'}`}>
                              {h.subject || "(No Subject)"}
                              {h.id === selectedConversation.id && <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded-full">Current</span>}
                           </h4>
                           <span className="text-xs text-slate-500 whitespace-nowrap">{formatDate(h.lastMessageAt)}</span>
                        </div>
                        
                        <p className="text-xs text-slate-600 line-clamp-2 mb-2">
                           {h.messages[0]?.bodyText || "No preview available..."}
                        </p>
                        
                        <div className="flex items-center gap-2">
                           {h.userTags?.map(tag => (
                              <span key={tag} className={`text-[10px] px-2 py-0.5 rounded-full border ${tag === 'non-customer-support' ? 'bg-gray-100 text-gray-600 border-gray-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                 {tag}
                              </span>
                           ))}
                           {h.archived && <span className="text-[10px] px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded-full flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Resolved</span>}
                           {h.needsReply && <span className="text-[10px] px-2 py-0.5 bg-orange-50 text-orange-700 border border-orange-100 rounded-full">Needs Reply</span>}
                        </div>
                     </div>

                     <div className="flex flex-col gap-1 border-l border-slate-100 pl-3 ml-1">
                        <button 
                           onClick={(e) => { e.stopPropagation(); selectConversation(h.id); setShowRelatedModal(false); }} 
                           className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" 
                           title="View Thread"
                        >
                           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        </button>
                     </div>
                  </div>
               ))}
               {history.length === 0 && (
                  <div className="text-center py-12 text-slate-400">
                     <p>No related conversations found.</p>
                  </div>
               )}
            </div>
          </div>
        </div>
      )}
      
      {/* Tracking Modal */}
      {showTrackingModal && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
           <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[80vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                 <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                 Tracking Information
              </h3>
              {loadingTracking ? (
                 <div className="py-8 text-center text-slate-500">Loading tracking info...</div>
              ) : trackingError ? (
                 <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">{trackingError}</div>
              ) : trackingData ? (
                 <div className="space-y-4">
                    <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                       <div>
                          <p className="text-xs text-slate-500 uppercase">Status</p>
                          <p className="font-bold text-blue-600 text-lg">
                             {trackingData.data?.[0]?.track_info?.latest_status?.status || "Unknown"}
                          </p>
                       </div>
                       <div className="text-right">
                          <p className="text-xs text-slate-500 uppercase">Carrier</p>
                          <p className="font-medium">{trackingData.data?.[0]?.carrier || "Unknown"}</p>
                       </div>
                    </div>
                    
                    <div className="space-y-3">
                       <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">History</h4>
                       <div className="space-y-4 relative pl-4 border-l-2 border-slate-200">
                          {trackingData.data?.[0]?.track_info?.tracking?.providers?.[0]?.events?.slice(0, 5).map((event: any, i: number) => (
                             <div key={i} className="relative">
                                <div className="absolute -left-[21px] top-1.5 w-3 h-3 bg-blue-500 rounded-full border-2 border-white"></div>
                                <p className="text-sm font-medium text-slate-800">{event.description}</p>
                                <p className="text-xs text-slate-500">{new Date(event.time_utc).toLocaleString()}</p>
                                <p className="text-xs text-slate-400">{event.location}</p>
                             </div>
                          ))}
                       </div>
                    </div>
                 </div>
              ) : (
                 <p className="text-center text-slate-500">No data available.</p>
              )}
              <div className="mt-6 flex justify-end">
                 <button onClick={() => setShowTrackingModal(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg">Close</button>
              </div>
           </div>
        </div>
      )}

      {/* Refund Modal */}
      {showRefundModal && refundOrder && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
           <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                 <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                 Refund Order #{refundOrder.order_number}
              </h3>
              
              <div className="space-y-4">
                 {/* Mode Selector */}
                 <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                    <button onClick={() => setRefundMode('simple')} className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${refundMode === 'simple' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Simple Refund</button>
                    <button onClick={() => setRefundMode('items')} className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${refundMode === 'items' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Refund Items</button>
                 </div>

                 {/* Simple Mode */}
                 {refundMode === 'simple' && (
                    <div className="space-y-3">
                       <div className="grid grid-cols-2 gap-3">
                          <button onClick={() => setRefundType('preset')} className={`p-3 border rounded-lg text-left transition-all ${refundType === 'preset' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                             <div className="font-medium text-sm">Preset %</div>
                             <div className="flex gap-2 mt-2">
                                <span onClick={(e) => { e.stopPropagation(); setRefundPreset(80); }} className={`px-2 py-1 text-xs rounded border cursor-pointer ${refundPreset === 80 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-300'}`}>80%</span>
                                <span onClick={(e) => { e.stopPropagation(); setRefundPreset(50); }} className={`px-2 py-1 text-xs rounded border cursor-pointer ${refundPreset === 50 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-300'}`}>50%</span>
                             </div>
                          </button>
                          <button onClick={() => setRefundType('full')} className={`p-3 border rounded-lg text-left transition-all ${refundType === 'full' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                             <div className="font-medium text-sm">Full Refund</div>
                             <div className="text-xs text-slate-500 mt-1">100% of total</div>
                          </button>
                       </div>
                    </div>
                 )}

                 {/* Items Mode */}
                 {refundMode === 'items' && (
                    <div className="space-y-2 max-h-60 overflow-y-auto border rounded-lg p-2">
                       {refundOrder.line_items.map((item: any) => {
                          const current = selectedLineItems.get(item.id) || { quantity: 0, restock: true };
                          return (
                             <div key={item.id} className="flex items-center justify-between p-2 border-b last:border-0">
                                <div className="flex-1">
                                   <p className="text-sm font-medium truncate">{item.name}</p>
                                   <p className="text-xs text-slate-500">${item.price}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                   <input 
                                     type="number" 
                                     min="0" 
                                     max={item.quantity} 
                                     value={current.quantity} 
                                     onChange={(e) => {
                                        const val = parseInt(e.target.value) || 0;
                                        setSelectedLineItems(prev => new Map(prev).set(item.id, { ...current, quantity: Math.min(val, item.quantity) }));
                                     }}
                                     className="w-16 border rounded px-2 py-1 text-sm"
                                   />
                                   <label className="flex items-center gap-1 text-xs">
                                      <input 
                                        type="checkbox" 
                                        checked={current.restock} 
                                        onChange={(e) => setSelectedLineItems(prev => new Map(prev).set(item.id, { ...current, restock: e.target.checked }))}
                                      /> Restock
                                   </label>
                                </div>
                             </div>
                          );
                       })}
                    </div>
                 )}

                 {/* Summary */}
                 <div className="bg-slate-50 p-3 rounded-lg flex justify-between items-center">
                    <span className="font-medium text-slate-700">Refund Amount:</span>
                    <span className="text-xl font-bold text-slate-900">${calculateRefundAmount().toFixed(2)}</span>
                 </div>

                 <textarea 
                    className="w-full border rounded-lg p-2 text-sm" 
                    placeholder="Reason for refund (optional)"
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                 />
                 
                 <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={refundNotifyCustomer} onChange={(e) => setRefundNotifyCustomer(e.target.checked)} />
                    Send notification to customer
                 </label>

                 <div className="flex justify-end gap-2 pt-2">
                    <button onClick={() => setShowRefundModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
                    <button 
                       onClick={processRefund} 
                       disabled={processingRefund || calculateRefundAmount() <= 0}
                       className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded shadow-sm disabled:opacity-50"
                    >
                       {processingRefund ? "Processing..." : "Process Refund"}
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && cancelOrder && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
           <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <h3 className="text-lg font-bold mb-4 text-red-600 flex items-center gap-2">
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                 Cancel Order #{cancelOrder.order_number}
              </h3>
              
              <div className="space-y-4">
                 <p className="text-sm text-slate-600">Are you sure you want to cancel this order? This action cannot be undone.</p>
                 
                 <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Reason</label>
                    <select 
                       value={cancelReason} 
                       onChange={(e: any) => setCancelReason(e.target.value)}
                       className="w-full border rounded-lg p-2 text-sm"
                    >
                       <option value="customer">Customer changed/cancelled order</option>
                       <option value="fraud">Fraudulent order</option>
                       <option value="inventory">Items unavailable</option>
                       <option value="declined">Payment declined</option>
                       <option value="other">Other</option>
                    </select>
                 </div>

                 <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                       <input type="checkbox" checked={cancelRefund} onChange={(e) => setCancelRefund(e.target.checked)} />
                       Refund full amount (${cancelOrder.total_price})
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                       <input type="checkbox" checked={cancelNotifyCustomer} onChange={(e) => setCancelNotifyCustomer(e.target.checked)} />
                       Send notification to customer
                    </label>
                 </div>

                 <div className="flex justify-end gap-2 pt-4">
                    <button onClick={() => setShowCancelModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">Abort</button>
                    <button 
                       onClick={processCancel} 
                       disabled={processingCancel}
                       className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded shadow-sm disabled:opacity-50"
                    >
                       {processingCancel ? "Cancelling..." : "Confirm Cancel"}
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Ask Question Modal */}
      {showAskQuestionModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
              <div className="p-6 border-b border-slate-200">
                <h3 className="text-lg font-bold text-slate-900">Ask a Question</h3>
                <p className="text-sm text-slate-500 mt-1">Submit a question to the internal Knowledge Base.</p>
              </div>
              
              <div className="p-6 overflow-y-auto space-y-4">
                <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1.5">Question</label>
                   <textarea 
                      className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="What do you need help with?"
                      rows={4}
                      value={questionText}
                      onChange={e => setQuestionText(e.target.value)}
                   />
                </div>
                
                <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1.5">Referenced Content (Optional)</label>
                   <textarea 
                      className="w-full border border-slate-300 rounded-lg p-3 text-sm font-mono bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Paste relevant email content or context here..."
                      rows={4}
                      value={questionReferencedEmail}
                      onChange={e => setQuestionReferencedEmail(e.target.value)}
                   />
                </div>
              </div>

              <div className="p-6 border-t border-slate-200 flex justify-end gap-3 bg-slate-50 rounded-b-xl">
                 <button 
                    onClick={() => setShowAskQuestionModal(false)} 
                    className="px-4 py-2 text-slate-600 hover:bg-white border border-transparent hover:border-slate-200 rounded-lg font-medium transition-all"
                 >
                    Cancel
                 </button>
                 <button 
                    onClick={handleSubmitQuestion} 
                    disabled={submittingQuestion || !questionText.trim()} 
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-sm disabled:opacity-50 transition-all"
                 >
                    {submittingQuestion ? "Submitting..." : "Submit Question"}
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
