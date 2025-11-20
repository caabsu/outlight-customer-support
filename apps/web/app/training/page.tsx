"use client";

import { useEffect, useState } from "react";

type TrainingConversation = {
  id: string;
  subject: string;
  trainingNotes: string;
  updatedAt: string;
  customer: {
    primaryEmail: string;
    name: string | null;
  };
  messages: any[];
};

export default function TrainingPage() {
  const [conversations, setConversations] = useState<TrainingConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/conversations/training/all")
      .then(res => res.json())
      .then(data => {
        setConversations(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  // Helper to strip styles from HTML for preview
  const sanitizeEmailHtml = (html: string): string => {
    if (!html) return html;
    let sanitized = html;
    sanitized = sanitized.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    return `<div class="gmail-email-body" style="width: 100%; overflow: hidden;">
      <style>
        .email-html-container .gmail-email-body table { max-width: 100% !important; box-sizing: border-box !important; }
        .email-html-container .gmail-email-body img { max-width: 100% !important; height: auto !important; }
        .email-html-container .gmail-email-body a { word-break: break-word !important; color: #2563eb; text-decoration: underline; }
        .email-html-container .gmail-email-body { font-family: sans-serif; color: #1e293b; }
      </style>
      ${sanitized}
    </div>`;
  };

  return (
    <div className="flex-1 h-screen overflow-hidden bg-slate-50 flex flex-col font-sans">
      <header className="px-8 py-6 bg-white border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <span className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
          </span>
          Training & Review Center
        </h1>
        <p className="text-slate-500 mt-2 max-w-2xl">
          Review past customer interactions that have been flagged for training purposes. 
          Study the admin notes and agent responses to improve your support quality.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading training materials...</div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
            <h3 className="text-lg font-medium text-slate-900">No training materials yet</h3>
            <p className="text-slate-500 mt-1">Flag conversations for review to see them here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {conversations.map(conv => (
              <div 
                key={conv.id} 
                className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all flex flex-col h-[500px]"
              >
                {/* Header / Notes */}
                <div className="p-5 bg-indigo-50/50 border-b border-indigo-100">
                  <div className="flex items-start justify-between mb-3">
                    <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase tracking-wide rounded">
                      Review Note
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(conv.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-indigo-900 font-medium italic leading-relaxed line-clamp-3">
                    "{conv.trainingNotes}"
                  </p>
                </div>

                {/* Email Preview */}
                <div className="p-5 flex-1 overflow-hidden flex flex-col">
                  <h3 className="font-bold text-slate-900 text-sm mb-1 truncate" title={conv.subject}>
                    {conv.subject || "(No Subject)"}
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">
                    {conv.customer.name || conv.customer.primaryEmail}
                  </p>

                  <div className="flex-1 overflow-y-auto bg-slate-50 rounded-lg p-3 space-y-3 border border-slate-100 text-xs">
                    {conv.messages.slice(0, 3).map((msg, i) => (
                      <div key={i} className={`p-2 rounded border ${msg.direction === 'outbound' ? 'bg-blue-50 border-blue-100 ml-4' : 'bg-white border-slate-200 mr-4'}`}>
                        <p className="font-bold text-[10px] mb-1 text-slate-500 uppercase">
                          {msg.direction === 'outbound' ? 'Agent' : 'Customer'}
                        </p>
                        <p className="line-clamp-4 text-slate-700">
                          {msg.bodyText || "HTML Content"}
                        </p>
                      </div>
                    ))}
                    {conv.messages.length > 3 && (
                      <div className="text-center text-[10px] text-slate-400 italic p-2">
                        + {conv.messages.length - 3} more messages
                      </div>
                    )}
                  </div>

                  <button 
                    onClick={() => setSelectedId(conv.id)}
                    className="mt-4 w-full py-2 bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 text-slate-600 text-sm font-medium rounded-lg transition-colors shadow-sm"
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
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
            {(() => {
              const conv = conversations.find(c => c.id === selectedId);
              if (!conv) return null;

              return (
                <>
                  <div className="p-6 border-b border-slate-200 flex justify-between items-start bg-slate-50">
                    <div className="flex-1 mr-8">
                       <div className="flex items-center gap-3 mb-2">
                          <span className="px-2.5 py-1 bg-indigo-600 text-white text-xs font-bold rounded-md shadow-sm">
                            Training Insight
                          </span>
                          <span className="text-xs text-slate-500">Reviewing conversation with {conv.customer.primaryEmail}</span>
                       </div>
                       <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 mt-3">
                          <h4 className="text-xs font-bold text-indigo-800 uppercase tracking-wide mb-1">Admin Notes</h4>
                          <p className="text-sm text-indigo-900">{conv.trainingNotes}</p>
                       </div>
                    </div>
                    <button 
                      onClick={() => setSelectedId(null)}
                      className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-8 bg-white space-y-6">
                    <h2 className="text-xl font-bold text-slate-900 mb-6 pb-4 border-b border-slate-100">
                      {conv.subject || "(No Subject)"}
                    </h2>
                    
                    {conv.messages.map((msg, idx) => (
                      <div key={msg.id || idx} className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-xl border p-5 shadow-sm ${msg.direction === "outbound" ? "bg-blue-50 border-blue-100" : "bg-slate-50 border-slate-200"}`}>
                          <div className="flex justify-between items-center gap-4 mb-3 pb-3 border-b border-black/5">
                             <div className="flex items-center gap-2">
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${msg.direction === "outbound" ? "bg-blue-200 text-blue-700" : "bg-slate-200 text-slate-600"}`}>
                                   {msg.direction === "outbound" ? "A" : "C"}
                                </span>
                                <span className="font-bold text-xs text-slate-700">{msg.direction === "outbound" ? "Agent Response" : "Customer Inquiry"}</span>
                             </div>
                             <span className="text-[10px] text-slate-400">{(msg as any).sentAt ? new Date((msg as any).sentAt).toLocaleString() : ""}</span>
                          </div>
                          <div className="text-sm whitespace-pre-wrap font-sans text-slate-800 leading-relaxed">
                            {msg.bodyText || (msg.bodyHtml ? <div dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(msg.bodyHtml) }} /> : "(No content)")}
                          </div>
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
