"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCurrentUser } from "@/components/AuthProvider";

type TrainingConversation = {
  id: string;
  subject: string;
  trainingNotes: string;
  trainingAt: string | null;
  trainingBy: string | null;
  trainingByUser: {
    name: string;
    email: string;
  } | null;
  trainingReadBy: string[];
  lastMessageAt: string;
  customer: {
    primaryEmail: string;
    name: string | null;
  };
  messages: any[];
};

// Helper to properly render email HTML
const sanitizeEmailHtml = (html: string): string => {
  if (!html) return html;
  let sanitized = html;
  sanitized = sanitized.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  sanitized = sanitized.replace(/\sclass\s*=\s*"[^"]*"/gi, '');
  sanitized = sanitized.replace(/\sclass\s*=\s*'[^']*'/gi, '');
  return `<div class="gmail-email-body" style="width: 100%; overflow: hidden; font-family: sans-serif; color: #1e293b;">
    <style>
      .email-html-container .gmail-email-body table { max-width: 100% !important; box-sizing: border-box !important; }
      .email-html-container .gmail-email-body img { max-width: 100% !important; height: auto !important; }
      .email-html-container .gmail-email-body a { word-break: break-word !important; color: #2563eb; text-decoration: underline; }
    </style>
    ${sanitized}
  </div>`;
};

// Helper to strip HTML for preview
const stripHtml = (html: string): string => {
  if (!html) return "";
  const tmp = document.createElement("DIV");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
};

const resolveInlineImages = (html: string, message: any): string => {
  if (!html || !message?.attachments || message.attachments.length === 0) return html;
  let resolvedHtml = html;
  message.attachments.forEach((att: any, idx: number) => {
    if (!att.contentId) return;
    const cid = att.contentId.replace(/[<>]/g, "");
    // Use API endpoint for attachments if available, otherwise fallback
    let src = att.data ? `data:${att.mimeType || "application/octet-stream"};base64,${att.data}` : `/api/messages/${message.id}/attachments/${idx}?inline=true`;
    const regex = new RegExp(`cid:${cid}`, "g");
    resolvedHtml = resolvedHtml.replace(regex, src);
  });
  return resolvedHtml;
};

export default function TrainingPage() {
  const [conversations, setConversations] = useState<TrainingConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'read' | 'unread'>('unread'); // Default to unread
  const currentUser = useCurrentUser();

  useEffect(() => {
    fetch("/api/conversations/training/all")
      .then(async (res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setConversations(data);
        } else {
          console.error("Expected array from API, got:", data);
          setConversations([]);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch training conversations:", err);
        setLoading(false);
      });
  }, []);

  const toggleRead = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!currentUser) return;

    // Optimistic update
    setConversations(prev => prev.map(c => {
      if (c.id === id) {
        const isRead = c.trainingReadBy?.includes(currentUser.id);
        const newReadBy = isRead 
          ? c.trainingReadBy.filter(uid => uid !== currentUser.id)
          : [...(c.trainingReadBy || []), currentUser.id];
        return { ...c, trainingReadBy: newReadBy };
      }
      return c;
    }));

    try {
      await fetch(`/api/conversations/${id}/training/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id })
      });
    } catch (error) {
      console.error("Failed to toggle read status", error);
      // Revert would go here
    }
  };

  const filteredConversations = conversations.filter(c => {
    if (!currentUser) return true;
    const isRead = c.trainingReadBy?.includes(currentUser.id);
    if (filter === 'read') return isRead;
    if (filter === 'unread') return !isRead;
    return true;
  });

  return (
    <div className="flex-1 h-screen overflow-hidden bg-slate-50 flex flex-col font-sans">
      <header className="px-8 py-6 bg-white border-b border-slate-200 shadow-sm z-10 flex justify-between items-start">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              <span className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
              </span>
              Training & Review Center
            </h1>
          </div>
          <p className="text-slate-500 mt-2 max-w-2xl text-sm">
            Review flagged interactions to improve support quality. Study admin notes and agent responses.
          </p>
        </div>
        
        <div className="flex flex-col items-end gap-4">
           <Link
            href="/emails"
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors border border-slate-200"
           >
            ← Back to Emails
           </Link>

           {/* Filters */}
           <div className="flex p-1 bg-slate-100 rounded-lg border border-slate-200">
              {(['unread', 'read', 'all'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all capitalize ${
                    filter === f 
                      ? `bg-white text-indigo-600 shadow-sm` 
                      : `text-slate-500 hover:text-slate-700`
                  }`}
                >
                  {f} ({conversations.filter(c => {
                    const isRead = c.trainingReadBy?.includes(currentUser?.id || "");
                    if (f === 'read') return isRead;
                    if (f === 'unread') return !isRead;
                    return true;
                  }).length})
                </button>
              ))}
           </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64">
            <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
            <div className="text-slate-500 font-medium">Loading training materials...</div>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-300 max-w-2xl mx-auto">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <h3 className="text-lg font-bold text-slate-900">No {filter} items found</h3>
            <p className="text-slate-500 mt-2">Great job! You&apos;re all caught up.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
            {filteredConversations.map(conv => {
              // Defensive check: Ensure customer object exists
              if (!conv || !conv.customer) return null;
              const isRead = currentUser && conv.trainingReadBy?.includes(currentUser.id);
              
              return (
              <div 
                key={conv.id} 
                onClick={() => setSelectedId(conv.id)}
                className={`bg-white rounded-xl shadow-sm border overflow-hidden hover:shadow-lg transition-all flex flex-col h-[220px] cursor-pointer group relative ${isRead ? `border-slate-200 opacity-80 hover:opacity-100` : `border-indigo-200 ring-1 ring-indigo-50`}`}
              >
                 {/* Status Badge */}
                 <div className="absolute top-4 right-4 z-10 flex gap-2">
                    <button 
                      onClick={(e) => toggleRead(e, conv.id)}
                      className={`p-1.5 rounded-full border transition-all shadow-sm ${isRead ? `bg-white text-slate-400 border-slate-200 hover:text-green-600 hover:border-green-200` : `bg-white text-indigo-600 border-indigo-100 hover:bg-green-50 hover:text-green-600 hover:border-green-200`}`}
                      title={isRead ? "Mark as Unread" : "Mark as Read"}
                    >
                       {isRead ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                       ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                       )}
                    </button>
                 </div>

                {/* Main Content Area */}
                <div className={`p-6 flex-1 flex flex-col justify-between ${isRead ? `bg-slate-50/50` : `bg-white`}`}>
                   <div className="pr-16">
                     <h3 className={`font-bold text-base mb-1 truncate ${isRead ? 'text-slate-600' : 'text-slate-900'}`} title={conv.subject}>
                       {conv.subject || "(No Subject)"}
                     </h3>
                     <p className="text-xs text-slate-500 truncate mb-3">
                       {conv.customer.name || conv.customer.primaryEmail || "Unknown Customer"}
                     </p>
                     {!isRead && <span className="inline-block px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase tracking-wide rounded-sm">New Review</span>}
                   </div>
                   
                   <div className="mt-auto flex items-center justify-between text-xs text-slate-400 pt-4 border-t border-slate-100/50">
                      <span className="font-medium text-slate-500">
                         Flagged: {conv.trainingAt ? new Date(conv.trainingAt).toLocaleDateString() : "Not recorded"}
                      </span>
                      <span className="font-medium text-indigo-500 group-hover:underline">View Conversation &rarr;</span>
                   </div>
                </div>
              </div>
            )})}
          </div>
        )}
      </div>

      {/* Full View Modal */}
      {selectedId && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          {/* Click outside to close */}
          <div className="absolute inset-0" onClick={() => setSelectedId(null)}></div>
          
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden relative z-10 animate-in zoom-in-95 duration-200">
            
            {/* Close Button */}
            <button 
               onClick={() => setSelectedId(null)}
               className="absolute top-4 right-4 p-2 bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full shadow-sm border border-slate-200 z-20 transition-colors"
            >
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>

            {(() => {
              const conv = conversations.find(c => c.id === selectedId);
              if (!conv) return null;
              const isRead = currentUser && conv.trainingReadBy?.includes(currentUser.id);

              return (
                <div className="flex h-full">
                   {/* LEFT: Review Notes Sidebar */}
                   <div className="w-[400px] bg-indigo-50 flex-shrink-0 flex flex-col border-r border-indigo-100">
                      <div className="p-8 border-b border-indigo-100 bg-white/50">
                         <h2 className="text-lg font-bold text-indigo-900 flex items-center gap-2 mb-4">
                           <span className="p-1.5 bg-indigo-100 rounded-md text-indigo-600">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                           </span>
                           Review Notes
                         </h2>
                         
                         {/* Mark Read Button in Modal */}
                         <button
                            onClick={(e) => toggleRead(e, conv.id)}
                            className={`w-full py-2.5 px-4 rounded-lg font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 mb-6 ${isRead ? 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50' : 'bg-green-600 text-white hover:bg-green-700 border border-transparent'}`}
                         >
                            {isRead ? (
                               <>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                  Completed
                               </>
                            ) : (
                               <>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                  Mark as Reviewed
                               </>
                            )}
                         </button>

                         <div className="flex flex-col gap-2 text-xs text-indigo-600/80 font-medium">
                           <div className="flex justify-between border-b border-indigo-100 pb-2">
                              <span>Reviewer:</span>
                              <span className="text-indigo-900 font-semibold">{conv.trainingByUser?.name || "Unknown User"}</span>
                           </div>
                           <div className="flex justify-between">
                              <span>Date Flagged:</span>
                              <span className="text-indigo-900 font-semibold">{conv.trainingAt ? new Date(conv.trainingAt).toLocaleString() : "Not recorded"}</span>
                           </div>
                         </div>
                      </div>
                      
                      <div className="p-8 overflow-y-auto flex-1">
                         <div className="prose prose-sm prose-indigo text-indigo-900 leading-relaxed whitespace-pre-wrap">
                            {conv.trainingNotes}
                         </div>
                      </div>
                   </div>

                   {/* RIGHT: Conversation View */}
                   <div className="flex-1 flex flex-col bg-slate-50 min-w-0">
                      {/* Header */}
                      <div className="p-6 bg-white border-b border-slate-200 flex-shrink-0">
                           <h2 className="text-xl font-bold text-slate-900 mb-2 line-clamp-2">{conv.subject || "(No Subject)"}</h2>
                           <div className="flex items-center gap-2 text-sm text-slate-600">
                              <span className="font-medium text-slate-900">{conv.customer?.name || "Unknown"}</span>
                              <span className="text-slate-300">&lt;{conv.customer?.primaryEmail || "No Email"}&gt;</span>
                           </div>
                      </div>

                      {/* Messages Area */}
                      <div className="flex-1 overflow-y-auto p-8 bg-slate-50 space-y-6 scrollbar-thin scrollbar-thumb-slate-300">
                        {Array.isArray(conv.messages) ? conv.messages.map((msg, idx) => {
                               // Strip HTML for preview in card, but sanitize for full view
                               const isOutbound = msg.direction === "outbound";
                               return (
                                  <div key={msg.id || idx} className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                                     <div className={`max-w-[85%] rounded-2xl border shadow-sm overflow-hidden ${isOutbound ? "bg-blue-50 border-blue-100" : "bg-white border-slate-200"}`}>
                                        
                                        {/* Msg Header */}
                                        <div className={`px-5 py-3 border-b flex items-center gap-3 ${isOutbound ? "border-blue-100 bg-blue-100/30" : "border-slate-100 bg-slate-50"}`}>
                                           <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${isOutbound ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-600"}`}>
                                              {isOutbound ? "Agent Response" : "Customer Inquiry"}
                                           </span>
                                           <span className="text-xs text-slate-400 ml-auto">
                                              {msg.sentAt ? new Date(msg.sentAt).toLocaleString() : ""}
                                           </span>
                                        </div>

                                        {/* Msg Body */}
                                        <div className="p-6 text-sm text-slate-800 leading-relaxed font-sans">
                                           {msg.bodyHtml ? (
                                              <div 
                                                 className="email-html-container"
                                                 dangerUySetInnerHTML={{ __html: sanitizeEmailHtml(resolveInlineImages(msg.bodyHtml, msg)) }} 
                                              />
                                           ) : (
                                              <p className="whitespace-pre-wrap">{msg.bodyText || "(No content)"}</p>
                                           )}
                                        </div>

                                        {/* Attachments */}
                                        {msg.attachments && msg.attachments.length > 0 && (
                                           <div className="px-6 pb-5 pt-1 flex flex-wrap gap-2">
                                              {msg.attachments.map((att: any, i: number) => (
                                                 <div key={i} className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 shadow-sm">
                                                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                                                    {att.filename || "Attachment"}
                                                 </div>
                                              ))}
                                           </div>
                                        )}
                                     </div>
                                  </div>
                               );
                            }) : (
                            <div className="p-12 text-center text-slate-500">No messages available to display.</div>
                        )}
                      </div>
                   </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}