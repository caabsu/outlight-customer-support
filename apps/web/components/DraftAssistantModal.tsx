"use client";

import { useState, useEffect, useRef } from "react";

interface DraftResponse {
  conversationId?: string;
  draft: string;
  reasoning?: string;
  actionSteps?: string[];
  orderInfo?: any;
  knowledgeBase?: any;
  tags?: string[];
  category?: string;
  customInstructions?: string;
}

interface DraftAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (text: string) => void;
  conversationId: string;
  customerName: string;
  customerEmail: string;
}

export default function DraftAssistantModal({
  isOpen,
  onClose,
  onInsert,
  conversationId,
  customerName,
  customerEmail,
}: DraftAssistantModalProps) {
  const [instruction, setInstruction] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<DraftResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [editedDraft, setEditedDraft] = useState("");
  const [activeTab, setActiveTab] = useState<"preview" | "reasoning" | "context" | "debug">("preview");

  // Check for existing draft on open
  useEffect(() => {
    if (!isOpen || isLoading) return;

    // If we have data matching this conversation, don't re-fetch (preserve state)
    if (data && data.conversationId === conversationId) return;

    const loadDraft = async () => {
        // Clear stale data
        setData(null);
        setEditedDraft("");
        setInstruction("");
        setLogs([]);
        
        try {
            const res = await fetch(`/api/conversations/${conversationId}/draft`);
            if (res.ok) {
                const draftData = await res.json();
                setData(draftData);
                setEditedDraft(draftData.draft || "");
                if (draftData.customInstructions) {
                    setInstruction(draftData.customInstructions);
                }
                addLog("Loaded existing draft from database.");
            }
        } catch (e) {
            // No draft found, clean state is correct
        }
    };
    loadDraft();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, conversationId]);

  const addLog = (msg: string) => setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    setLogs([]); // Clear previous logs
    addLog("Initializing draft generation...");
    addLog(`Target: ${customerName} (${customerEmail})`);
    addLog(`Context: ${instruction || "None"}`);

    try {
      addLog("Fetching context from Shopify...");
      addLog("Querying Knowledge Base...");
      
      const response = await fetch(`/api/conversations/${conversationId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ additionalContext: instruction }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API Error ${response.status}: ${errText}`);
      }

      addLog("Processing AI response...");
      const result: DraftResponse = await response.json();
      
      setData(result);
      setEditedDraft(result.draft);
      addLog("Draft generated successfully.");
      addLog("✨ GENERATION COMPLETE ✨");
      
      if (result.orderInfo) addLog("✅ Found relevant order data.");
      if (result.knowledgeBase) addLog("✅ Applied Knowledge Base policies.");

    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Unknown error occurred";
      setError(msg);
      addLog(`❌ Error: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
      if (!confirm("Are you sure you want to delete this draft? This cannot be undone.")) return;
      setIsLoading(true);
      try {
          await fetch(`/api/conversations/${conversationId}/draft`, { method: "DELETE" });
          setData(null);
          setEditedDraft("");
          setInstruction("");
          setLogs([]);
          addLog("Draft deleted. Ready to start fresh.");
      } catch (err) {
          console.error(err);
          addLog("❌ Failed to delete draft.");
      } finally {
          setIsLoading(false);
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-6xl h-[85vh] rounded-2xl shadow-2xl flex overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        
        {/* LEFT SIDEBAR: Controls & Scope */}
        <div className="w-1/3 bg-slate-50 border-r border-slate-200 flex flex-col">
          {/* ... (header and inputs remain the same) ... */}
          
          {/* Header */}
          <div className="p-5 border-b border-slate-200 flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              AI Draft Assistant
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1 px-5 pb-2">Powered by Gemini 3.0 Pro</p>

          {/* Inputs */}
          <div className="p-5 flex-1 overflow-y-auto space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">
                Custom Instructions
              </label>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                className="w-full h-32 p-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none shadow-sm bg-white"
                placeholder="E.g., 'Offer a 10% discount code', 'Be strictly professional', 'Explain return policy'..."
              />
              <p className="text-[10px] text-slate-400 mt-1.5">
                Add specific details or tone adjustments here.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">
                Scope & Capabilities
              </label>
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-md">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-xs font-medium text-slate-700">Shopify Data Access</span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-md">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-xs font-medium text-slate-700">Knowledge Base Policies</span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-md">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-xs font-medium text-slate-700">Previous Conversation History</span>
                </div>
              </div>
            </div>
            
            {/* Status Logs Preview (Small) */}
            <div className="bg-slate-900 rounded-lg p-3 font-mono text-[10px] text-slate-300 max-h-32 overflow-y-auto">
                {logs.length === 0 ? <span className="text-slate-600">Ready to generate...</span> : logs.map((log, i) => (
                    <div key={i} className="truncate">{log}</div>
                ))}
            </div>
          </div>

          {/* Sidebar Footer */}
          <div className="p-5 border-t border-slate-200 bg-white space-y-3">
            <button
              onClick={handleGenerate}
              disabled={isLoading}
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  {data ? 'Regenerate Draft' : 'Generate Draft'}
                </>
              )}
            </button>
            
            {data && (
                <button
                    onClick={handleDelete}
                    disabled={isLoading}
                    className="w-full py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-lg font-medium text-xs transition-colors flex items-center justify-center gap-2"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Delete
                </button>
            )}
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="w-2/3 flex flex-col bg-white">
          {/* Tabs */}
          <div className="flex items-center border-b border-slate-200 px-6 bg-slate-50/50">
            <button
              onClick={() => setActiveTab("preview")}
              className={`py-4 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "preview"
                  ? "border-purple-600 text-purple-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Preview & Edit
            </button>
            <button
              onClick={() => setActiveTab("context")}
              className={`py-4 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "context"
                  ? "border-purple-600 text-purple-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Context & Sources
            </button>
            <button
              onClick={() => setActiveTab("reasoning")}
              className={`py-4 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "reasoning"
                  ? "border-purple-600 text-purple-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              AI Reasoning
            </button>
             <button
              onClick={() => setActiveTab("debug")}
              className={`py-4 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "debug"
                  ? "border-purple-600 text-purple-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Debug Logs
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 p-6 overflow-y-auto bg-slate-50/30 relative">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-4 flex items-start gap-3">
                <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <div>
                    <h4 className="font-bold text-sm">Generation Failed</h4>
                    <p className="text-sm mt-1">{error}</p>
                    <button onClick={handleGenerate} className="text-xs underline mt-2 hover:text-red-800">Try Again</button>
                </div>
              </div>
            )}

            {isLoading && !data && !error && (
               <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <div className="relative w-16 h-16 mb-4">
                     <div className="absolute inset-0 border-4 border-slate-200 rounded-full"></div>
                     <div className="absolute inset-0 border-4 border-purple-500 rounded-full border-t-transparent animate-spin"></div>
                  </div>
                  <p className="text-sm font-medium">Analyzing conversation...</p>
                  <p className="text-xs mt-2 opacity-70">{logs[logs.length - 1]}</p>
               </div>
            )}

            {!isLoading && !data && !error && (
               <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <svg className="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  <p>Click &quot;Generate Draft&quot; to start.</p>
               </div>
            )}

            {data && (
              <>
                {activeTab === "preview" && (
                  <div className="h-full flex flex-col">
                    <div className="flex justify-between items-center mb-3">
                       <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Email Draft</span>
                       <button 
                          onClick={() => navigator.clipboard.writeText(editedDraft)}
                          className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                       >
                          Copy Text
                       </button>
                    </div>
                    <textarea
                      value={editedDraft}
                      onChange={(e) => setEditedDraft(e.target.value)}
                      className="flex-1 w-full p-6 bg-white border border-slate-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800 leading-relaxed resize-none font-sans text-base"
                      placeholder="Draft content..."
                    />
                  </div>
                )}

                {activeTab === "context" && (
                  <div className="space-y-6">
                    {data.orderInfo ? (
                      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                           <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                           Shopify Order Context
                        </h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                           <div>
                              <span className="block text-xs text-slate-500">Order ID</span>
                              <span className="font-medium">{data.orderInfo.orderId || 'N/A'}</span>
                           </div>
                           <div>
                              <span className="block text-xs text-slate-500">Total</span>
                              <span className="font-medium">{data.orderInfo.total ? `$${data.orderInfo.total}` : 'N/A'}</span>
                           </div>
                           <div>
                              <span className="block text-xs text-slate-500">Date</span>
                              <span className="font-medium">{data.orderInfo.date || 'N/A'}</span>
                           </div>
                           <div>
                              <span className="block text-xs text-slate-500">Return Window</span>
                              <span className={`font-medium px-2 py-0.5 rounded-full text-xs inline-block ${data.orderInfo.isWithinReturnWindow ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                 {data.orderInfo.isWithinReturnWindow ? 'Active' : 'Expired'}
                              </span>
                           </div>
                        </div>
                      </div>
                    ) : (
                       <div className="bg-slate-50 p-4 rounded-lg text-sm text-slate-500 italic">No specific order linked to this draft.</div>
                    )}

                    {data.knowledgeBase && (
                       <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                          <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                             <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                             Knowledge Base Sources
                          </h3>
                          <pre className="text-xs bg-slate-50 p-3 rounded border border-slate-100 overflow-x-auto whitespace-pre-wrap">
                             {JSON.stringify(data.knowledgeBase, null, 2)}
                          </pre>
                       </div>
                    )}
                  </div>
                )}

                {activeTab === "reasoning" && (
                   <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-full overflow-y-auto">
                      <h3 className="text-sm font-bold text-slate-800 mb-4">AI Thought Process</h3>
                      <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                         {data.reasoning || "No reasoning provided by the model."}
                      </p>
                   </div>
                )}

                {activeTab === "debug" && (
                   <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-sm h-full overflow-y-auto font-mono text-xs">
                      {logs.map((log, i) => (
                         <div key={i} className="text-green-400 mb-1 border-b border-slate-800/50 pb-1 last:border-0">
                            {log}
                         </div>
                      ))}
                   </div>
                )}
              </>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-5 border-t border-slate-200 bg-white flex justify-between items-center">
            <button
              onClick={onClose}
              className="px-5 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium text-sm transition-colors"
            >
              Cancel
            </button>
            <div className="flex gap-3">
               {activeTab !== 'preview' && (
                  <button
                     onClick={() => setActiveTab('preview')}
                     className="px-5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium text-sm transition-colors"
                  >
                     Back to Preview
                  </button>
               )}
              <button
                onClick={() => onInsert(editedDraft)}
                disabled={!data || !editedDraft}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm shadow-md transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Insert Draft
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
