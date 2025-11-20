"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type TrainingConversation = {
  id: string;
  subject: string;
  trainingNotes: string;
  trainingAt: string | null;
  trainingByUser: {
    name: string;
    email: string;
  } | null;
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

  return (
    <div className="flex-1 h-screen overflow-hidden bg-slate-50 flex flex-col font-sans">
      <header className="px-8 py-6 bg-white border-b border-slate-200 shadow-sm z-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <span className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
            </span>
            Training & Review Center
          </h1>
          <Link
            href="/emails"
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors border border-slate-200"
          >
            ← Back to Emails
          </Link>
        </div>
        <p className="text-slate-500 mt-2 max-w-2xl text-sm">
          Review flagged interactions to improve support quality. Study admin notes and agent responses.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64">
            <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
            <div className="text-slate-500 font-medium">Loading training materials...</div>
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-300 max-w-2xl mx-auto">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            </div>
            <h3 className="text-lg font-bold text-slate-900">No training materials yet</h3>
            <p className="text-slate-500 mt-2">Flag conversations for review to populate this dashboard.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
            {conversations.map(conv => (
              <div 
                key={conv.id} 
                className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-lg transition-all flex flex-col h-[550px] group"
              >
                {/* Header / Notes */}
                <div className="p-6 bg-indigo-50/50 border-b border-indigo-100 flex-shrink-0">
                  <div className="flex items-center justify-between mb-3">
                    <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase tracking-wide rounded-md border border-indigo-200">
                      Review Note
                    </span>
                    <span className="text-xs text-slate-500 font-medium" title={conv.trainingAt ? new Date(conv.trainingAt).toLocaleString() : "Date unknown"}>
                      {conv.trainingAt ? new Date(conv.trainingAt).toLocaleDateString() : "Date unknown"}
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-indigo-100 shadow-sm">
                    <p className="text-sm text-indigo-900 font-medium whitespace-pre-wrap leading-relaxed line-clamp-4 italic">
                      &quot;{conv.trainingNotes}&quot;
                    </p>
                    <div className="mt-2 pt-2 border-t border-indigo-50 flex items-center justify-end">
                      <span className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider">
                        By: {conv.trainingByUser?.name || "Admin"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Conversation Preview */}
                <div className="p-5 flex-1 overflow-hidden flex flex-col bg-white">
                  <div className="mb-4">
                    <h3 className="font-bold text-slate-900 text-sm mb-1 truncate pr-4" title={conv.subject}>
                      {conv.subject || "(No Subject)"}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-400"></span>
                      <p className="text-xs text-slate-500 font-medium truncate">
                        {conv.customer.name || conv.customer.primaryEmail}
                      </p>
                    </div>
                  </div>

                  <div className="flex-1 overflow-hidden bg-slate-50 rounded-xl border border-slate-100 relative">
                    <div className="absolute inset-0 p-3 overflow-y-auto space-y-3 scrollbar-thin scrollbar-thumb-slate-200">
                      {conv.messages.slice(0, 3).map((msg, i) => (
                        <div key={i} className={`p-3 rounded-lg border shadow-sm text-xs ${msg.direction === 'outbound' ? 'bg-blue-50 border-blue-100 ml-4' : 'bg-white border-slate-200 mr-4'}`}>
                          <div className="flex justify-between items-center mb-1.5 opacity-70">
                             <span className="font-bold uppercase tracking-wider text-[9px]">
                                {msg.direction === 'outbound' ? 'Agent' : 'Customer'}
                             </span>
                             <span className="text-[9px]">{new Date(msg.sentAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                          </div>
                          <div className="line-clamp-3 text-slate-700 leading-relaxed">
                            {msg.bodyText || "HTML Content"}
                          </div>
                        </div>
                      ))}
                    </div>
                    {conv.messages.length > 3 && (
                      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none flex items-end justify-center pb-2">
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full border border-slate-200 shadow-sm">
                          +{conv.messages.length - 3} more
                        </span>
                      </div>
                    )}
                  </div>

                  <button 
                    onClick={() => setSelectedId(conv.id)}
                    className="mt-5 w-full py-2.5 bg-white border border-slate-200 hover:border-indigo-500 hover:text-indigo-600 text-slate-600 text-sm font-bold rounded-lg transition-all shadow-sm hover:shadow-md"
                  >
                    View Full Conversation
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Full View Modal */}
      {selectedId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            {(() => {
              const conv = conversations.find(c => c.id === selectedId);
              if (!conv) return null;

              return (
                <>
                  {/* Modal Header */}
                  <div className="flex-shrink-0 flex border-b border-slate-200 h-full max-h-[250px]">
                     {/* Left: Notes */}
                     <div className="w-1/3 bg-indigo-50 p-6 border-r border-slate-200 overflow-y-auto">
                        <div className="flex items-center gap-2 mb-4">
                          <span className="px-2.5 py-1 bg-indigo-600 text-white text-xs font-bold rounded-md shadow-sm uppercase tracking-wide">
                            Review Note
                          </span>
                          <span className="text-xs text-indigo-400 font-semibold">
                             by {conv.trainingByUser?.name || "Admin"}
                          </span>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm text-sm text-indigo-950 leading-relaxed whitespace-pre-wrap">
                           &quot;{conv.trainingNotes}&quot;
                        </div>
                        {conv.trainingAt && (
                           <p className="text-right text-[10px] text-indigo-400 mt-2 font-medium">
                              Marked on {new Date(conv.trainingAt).toLocaleString()}
                           </p>
                        )}
                     </div>

                     {/* Right: Meta */}
                     <div className="flex-1 bg-white p-6 flex flex-col justify-between">
                        <div>
                           <h2 className="text-xl font-bold text-slate-900 mb-2 line-clamp-2">{conv.subject || "(No Subject)"}</h2>
                           <div className="flex items-center gap-2 text-sm text-slate-600">
                              <span className="font-medium text-slate-900">{conv.customer.name || "Unknown"}</span>
                              <span className="text-slate-300">&lt;{conv.customer.primaryEmail}&gt;</span>
                           </div>
                        </div>
                        <div className="flex justify-end">
                           <button 
                             onClick={() => setSelectedId(null)}
                             className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition-colors"
                           >
                             Close Review
                           </button>
                        </div>
                     </div>
                  </div>

                  {/* Messages Area */}
                  <div className="flex-1 overflow-y-auto p-8 bg-slate-50 space-y-6 scrollbar-thin scrollbar-thumb-slate-300">
                    {conv.messages.map((msg, idx) => (
                      <div key={msg.id || idx} className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-2xl shadow-sm border ${msg.direction === "outbound" ? "bg-blue-50 border-blue-100" : "bg-white border-slate-200"} overflow-hidden`}>
                          
                          {/* Message Header */}
                          <div className={`px-5 py-3 border-b flex justify-between items-center ${msg.direction === "outbound" ? "border-blue-100 bg-blue-100/50" : "border-slate-100 bg-slate-50"}`}>
                             <div className="flex items-center gap-2">
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm ${msg.direction === "outbound" ? "bg-blue-600 text-white" : "bg-slate-600 text-white"}`}>
                                   {msg.direction === "outbound" ? "A" : "C"}
                                </span>
                                <span className={`text-xs font-bold uppercase tracking-wide ${msg.direction === "outbound" ? "text-blue-800" : "text-slate-700"}`}>
                                   {msg.direction === "outbound" ? "Agent Response" : "Customer Inquiry"}
                                </span>
                             </div>
                             <span className="text-[10px] font-medium text-slate-400">
                                {(msg as any).sentAt ? new Date((msg as any).sentAt).toLocaleString() : ""}
                             </span>
                          </div>
                          
                          {/* Message Body */}
                          <div className="p-6 text-sm text-slate-800 leading-relaxed overflow-x-auto font-sans">
                            {msg.bodyHtml ? (
                               <div 
                                  className="email-html-container"
                                  dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(resolveInlineImages(msg.bodyHtml, msg)) }} 
                               />
                            ) : (
                               <p className="whitespace-pre-wrap">{msg.bodyText || "(No content)"}</p>
                            )}
                          </div>

                          {/* Attachments */}
                          {msg.attachments && msg.attachments.length > 0 && (
                             <div className="px-6 pb-4 pt-2 flex gap-2 flex-wrap">
                                {msg.attachments.map((att: any, i: number) => (
                                   <div key={i} className="px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-medium text-slate-600 flex items-center gap-2">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                                      {att.filename || "Attachment"}
                                   </div>
                                ))}
                             </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
