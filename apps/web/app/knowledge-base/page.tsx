"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AIAssistant from "../../components/AIAssistant";

type KnowledgeEntry = {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export default function KnowledgeBasePage() {
  const router = useRouter();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<KnowledgeEntry | null>(null);
  const [isNewDocument, setIsNewDocument] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Editor state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");
  const [tags, setTags] = useState("");
  const [active, setActive] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // AI Assistant state
  const [showAIWriter, setShowAIWriter] = useState(false);
  const [showAIEditor, setShowAIEditor] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState("");

  // Tool Access state
  const [showToolAccess, setShowToolAccess] = useState(false);
  const [toolAccess, setToolAccess] = useState<any>(null);
  const [loadingToolAccess, setLoadingToolAccess] = useState(false);

  useEffect(() => {
    fetchEntries();
    fetchToolAccess();
  }, []);

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/knowledge-base");
      const data = await res.json();
      setEntries(data);
    } catch (error) {
      console.error("Failed to fetch knowledge base:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchToolAccess = async () => {
    try {
      setLoadingToolAccess(true);
      const res = await fetch("/api/knowledge-base/tool-access");
      if (!res.ok) {
        const errorData = await res.json();
        console.error("Failed to fetch tool access:", res.status, errorData);
        setToolAccess(null);
        return;
      }
      const data = await res.json();
      console.log("Tool access data received:", data);
      setToolAccess(data);
    } catch (error) {
      console.error("Failed to fetch tool access:", error);
      setToolAccess(null);
    } finally {
      setLoadingToolAccess(false);
    }
  };

  const handleSelectEntry = (entry: KnowledgeEntry) => {
    if (hasUnsavedChanges && !confirm("You have unsaved changes. Continue?")) {
      return;
    }
    setSelectedEntry(entry);
    setTitle(entry.title);
    setContent(entry.content);
    setCategory(entry.category);
    setTags(entry.tags.join(", "));
    setActive(entry.active);
    setIsNewDocument(false);
    setHasUnsavedChanges(false);
    setShowAIWriter(false);
    setShowAIEditor(false);
    setAiSuggestion("");
  };

  const handleNewDocument = () => {
    if (hasUnsavedChanges && !confirm("You have unsaved changes. Continue?")) {
      return;
    }
    setSelectedEntry(null);
    setTitle("");
    setContent("");
    setCategory("general");
    setTags("");
    setActive(true);
    setIsNewDocument(true);
    setHasUnsavedChanges(false);
    setShowAIWriter(false);
    setShowAIEditor(false);
    setAiSuggestion("");
  };

  const handleSave = async () => {
    const tagsArray = tags.split(",").map(t => t.trim()).filter(t => t);

    const payload = {
      title,
      content,
      category,
      tags: tagsArray,
      active
    };

    try {
      if (selectedEntry && !isNewDocument) {
        await fetch(`/api/knowledge-base/${selectedEntry.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      } else {
        const res = await fetch("/api/knowledge-base", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const newEntry = await res.json();
        setSelectedEntry(newEntry);
        setIsNewDocument(false);
      }

      setHasUnsavedChanges(false);
      fetchEntries();
      fetchToolAccess(); // Refresh tool access data
    } catch (error) {
      console.error("Failed to save entry:", error);
      alert("Failed to save. Please try again.");
    }
  };

  const handleDelete = async () => {
    if (!selectedEntry) return;
    if (!confirm(`Delete "${selectedEntry.title}"? This cannot be undone.`)) return;

    try {
      await fetch(`/api/knowledge-base/${selectedEntry.id}`, {
        method: "DELETE"
      });
      setSelectedEntry(null);
      setTitle("");
      setContent("");
      setCategory("general");
      setTags("");
      setActive(true);
      setIsNewDocument(false);
      setHasUnsavedChanges(false);
      fetchEntries();
      fetchToolAccess(); // Refresh tool access data
    } catch (error) {
      console.error("Failed to delete entry:", error);
      alert("Failed to delete. Please try again.");
    }
  };

  const handleAIWrite = async () => {
    if (!aiPrompt.trim()) {
      alert("Please enter a description of what you want to write.");
      return;
    }

    setAiGenerating(true);
    setAiSuggestion("");

    try {
      const response = await fetch("/api/ai/write-kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          category: category,
          existingContent: content
        })
      });

      if (!response.ok) throw new Error("AI request failed");

      const data = await response.json();
      setAiSuggestion(data.content || data.suggestion);
    } catch (error) {
      console.error("AI writing failed:", error);
      alert("AI writing failed. Please try again.");
    } finally {
      setAiGenerating(false);
    }
  };

  const handleAIEdit = async () => {
    if (!content.trim()) {
      alert("Please enter some content to edit.");
      return;
    }

    setAiGenerating(true);
    setAiSuggestion("");

    try {
      const response = await fetch("/api/ai/edit-kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content,
          title: title,
          category: category,
          instructions: aiPrompt || "Improve clarity, grammar, and professional tone"
        })
      });

      if (!response.ok) throw new Error("AI request failed");

      const data = await response.json();
      setAiSuggestion(data.content || data.suggestion);
    } catch (error) {
      console.error("AI editing failed:", error);
      alert("AI editing failed. Please try again.");
    } finally {
      setAiGenerating(false);
    }
  };

  const applyAISuggestion = () => {
    setContent(aiSuggestion);
    setHasUnsavedChanges(true);
    setAiSuggestion("");
    setShowAIWriter(false);
    setShowAIEditor(false);
    setAiPrompt("");
  };

  const filteredEntries = entries.filter(entry =>
    entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    entry.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    entry.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getCategoryLabel = (cat: string) => {
    const labels: Record<string, string> = {
      general: "General",
      summary: "Summary",
      "draft-reply": "Draft Reply",
      "suggest-tags": "Suggest Tags",
      "find-similar": "Find Similar"
    };
    return labels[cat] || cat;
  };

  const getCategoryColor = (cat: string) => {
    const colors: Record<string, string> = {
      general: "bg-blue-500",
      summary: "bg-purple-500",
      "draft-reply": "bg-green-500",
      "suggest-tags": "bg-yellow-500",
      "find-similar": "bg-pink-500"
    };
    return colors[cat] || colors.general;
  };

  return (
    <>
      <AIAssistant />
      <div className="flex h-screen bg-slate-50">
      {/* Left Sidebar - Document List */}
      <div className="w-80 bg-white border-r border-slate-200 flex flex-col">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-200">
          <button
            onClick={() => router.push("/emails")}
            className="flex items-center gap-2 px-2 py-1 text-xs text-slate-500 hover:text-slate-700 transition-colors mb-3"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Emails
          </button>
          <h1 className="text-sm font-semibold text-slate-900 mb-1">Knowledge Base</h1>
          <p className="text-xs text-slate-500">AI context & instructions</p>
          <button
            onClick={() => router.push("/products")}
            className="mt-2 w-full px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-medium rounded transition-colors flex items-center justify-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
            Product Knowledge Base
          </button>
          <button
            onClick={() => setShowToolAccess(!showToolAccess)}
            className="mt-2 w-full px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium rounded transition-colors flex items-center justify-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {showToolAccess ? "Hide" : "View"} AI Tool Access
          </button>
        </div>

        {/* Tool Access Panel */}
        {showToolAccess && (
          <div className="flex-1 overflow-y-auto p-3 bg-indigo-50 border-b border-indigo-200">
            <h2 className="text-xs font-semibold text-indigo-900 mb-2 flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              AI Tool Knowledge Access
            </h2>
            {loadingToolAccess ? (
              <p className="text-xs text-indigo-600">Loading...</p>
            ) : toolAccess ? (
              <div className="space-y-2">
                {Object.entries(toolAccess).map(([key, tool]: [string, any]) => (
                  <div key={key} className="bg-white rounded-lg p-2.5 border border-indigo-200">
                    <div className="flex items-start justify-between mb-1.5">
                      <div>
                        <h3 className="text-xs font-semibold text-slate-900">{tool.name}</h3>
                        <p className="text-[10px] text-slate-600 mt-0.5">{tool.description}</p>
                        <p className="text-[9px] text-indigo-600 mt-1 font-mono">{tool.model}</p>
                      </div>
                    </div>
                    <div className="mt-2">
                      <p className="text-[10px] font-semibold text-slate-700 mb-1">
                        📚 Knowledge: {tool.entries.length} {tool.entries.length === 1 ? 'entry' : 'entries'}
                      </p>
                      {tool.categories.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {tool.categories.map((cat: string) => (
                            <span key={cat} className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                              {cat}
                            </span>
                          ))}
                        </div>
                      )}
                      {tool.entries.length > 0 && (
                        <div className="space-y-0.5 max-h-20 overflow-y-auto">
                          {tool.entries.map((entry: any) => (
                            <div key={entry.id} className="text-[9px] text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded">
                              • {entry.title}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-red-600">Failed to load tool access</p>
            )}
          </div>
        )}

        {/* Search */}
        <div className="p-3 border-b border-slate-200">
          <div className="relative">
            <svg className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents..."
              className="w-full pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* New Document Button */}
        <div className="p-3 border-b border-slate-200">
          <button
            onClick={handleNewDocument}
            className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Document
          </button>
        </div>

        {/* Documents List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-xs text-slate-500 text-center">Loading...</div>
          ) : filteredEntries.length === 0 ? (
            <div className="p-4 text-xs text-slate-500 text-center">
              {searchQuery ? "No matching documents" : "No documents yet"}
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredEntries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => handleSelectEntry(entry)}
                  className={`w-full text-left px-3 py-2.5 rounded-md transition-colors ${
                    selectedEntry?.id === entry.id
                      ? "bg-blue-50 border border-blue-200"
                      : "hover:bg-slate-50 border border-transparent"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-xs font-medium text-slate-900 line-clamp-1">
                      {entry.title}
                    </h3>
                    {!entry.active && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${getCategoryColor(entry.category)}`}></div>
                    <span className="text-[10px] text-slate-500">
                      {getCategoryLabel(entry.category)}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 line-clamp-2">
                    {entry.content}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col bg-white">
        {!selectedEntry && !isNewDocument ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h2 className="text-sm font-medium text-slate-900 mb-1">No document selected</h2>
              <p className="text-xs text-slate-500 mb-4">Select a document or create a new one</p>
              <button
                onClick={handleNewDocument}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors"
              >
                Create New Document
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Editor Header */}
            <div className="px-6 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  placeholder="Document title..."
                  className="text-sm font-semibold text-slate-900 bg-transparent border-none focus:outline-none w-96"
                />
                {hasUnsavedChanges && (
                  <span className="text-[10px] px-2 py-1 bg-amber-100 text-amber-700 rounded">
                    Unsaved changes
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowAIWriter(true);
                    setShowAIEditor(false);
                  }}
                  className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  AI Writer
                </button>
                <button
                  onClick={() => {
                    setShowAIEditor(true);
                    setShowAIWriter(false);
                  }}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  AI Editor
                </button>
                {selectedEntry && !isNewDocument && (
                  <button
                    onClick={handleDelete}
                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium rounded-md transition-colors"
                  >
                    Delete
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={!hasUnsavedChanges && !isNewDocument}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isNewDocument ? "Create" : "Save"}
                </button>
              </div>
            </div>

            {/* AI Assistant Panel */}
            {(showAIWriter || showAIEditor) && (
              <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-indigo-50">
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                      <h3 className="text-xs font-semibold text-slate-900">
                        {showAIWriter ? "AI Writing Assistant" : "AI Editing Assistant"}
                      </h3>
                    </div>
                    <p className="text-[11px] text-slate-600 mb-3">
                      {showAIWriter
                        ? "Describe what you want to write and AI will generate professional content for your knowledge base."
                        : "AI will analyze and improve your content for clarity, grammar, and professional tone."
                      }
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder={showAIWriter ? "e.g., Write a policy for 30-day returns on lighting products" : "e.g., Make it more concise and professional"}
                        className="flex-1 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            showAIWriter ? handleAIWrite() : handleAIEdit();
                          }
                        }}
                      />
                      <button
                        onClick={showAIWriter ? handleAIWrite : handleAIEdit}
                        disabled={aiGenerating}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {aiGenerating ? (
                          <>
                            <svg className="animate-spin w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Generating...
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            {showAIWriter ? "Generate" : "Improve"}
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setShowAIWriter(false);
                          setShowAIEditor(false);
                          setAiPrompt("");
                          setAiSuggestion("");
                        }}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-md transition-colors"
                      >
                        Close
                      </button>
                    </div>

                    {/* AI Suggestion */}
                    {aiSuggestion && (
                      <div className="mt-3 p-3 bg-white border border-purple-200 rounded-md">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-semibold text-slate-900">AI Suggestion</h4>
                          <button
                            onClick={applyAISuggestion}
                            className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-medium rounded transition-colors"
                          >
                            Apply to Document
                          </button>
                        </div>
                        <div className="text-[11px] text-slate-800 whitespace-pre-wrap font-mono bg-slate-50 p-3 rounded border border-slate-200 max-h-48 overflow-y-auto">
                          {aiSuggestion}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Editor Toolbar */}
            <div className="px-6 py-2 border-b border-slate-200 flex items-center gap-4 bg-slate-50">
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-medium text-slate-700">Category:</label>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  className="px-2 py-1 text-[11px] text-slate-900 bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="general">General (All AI)</option>
                  <option value="summary">Summary Only</option>
                  <option value="draft-reply">Draft Reply Only</option>
                  <option value="suggest-tags">Suggest Tags Only</option>
                  <option value="find-similar">Find Similar Only</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-medium text-slate-700">Tags:</label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => {
                    setTags(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  placeholder="comma, separated, tags"
                  className="px-2 py-1 text-[11px] text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 w-64"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="active"
                  checked={active}
                  onChange={(e) => {
                    setActive(e.target.checked);
                    setHasUnsavedChanges(true);
                  }}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="active" className="text-[11px] font-medium text-slate-700">
                  Active (AI will use this)
                </label>
              </div>
            </div>

            {/* Main Content Editor */}
            <div className="flex-1 overflow-y-auto">
              <textarea
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                placeholder="Write your knowledge base content here...

For best results:
• Be specific and clear
• Include relevant examples
• Use professional language
• Format with line breaks for readability"
                className="w-full h-full px-6 py-4 text-[13px] leading-relaxed text-slate-900 placeholder:text-slate-400 bg-white resize-none focus:outline-none font-mono"
                style={{
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                  lineHeight: "1.6"
                }}
              />
            </div>

            {/* Footer Info */}
            <div className="px-6 py-2 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-4 text-[10px] text-slate-500">
                {selectedEntry && !isNewDocument && (
                  <>
                    <span>Created: {new Date(selectedEntry.createdAt).toLocaleDateString()}</span>
                    <span>Updated: {new Date(selectedEntry.updatedAt).toLocaleDateString()}</span>
                  </>
                )}
              </div>
              <div className="text-[10px] text-slate-500">
                {content.length} characters • {content.split(/\s+/).filter(w => w).length} words
              </div>
            </div>
          </>
        )}
      </div>
    </div>
    </>
  );
}
