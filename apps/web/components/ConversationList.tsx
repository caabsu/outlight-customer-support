"use client";

import { useConversations, type Conversation } from "@/lib/ConversationContext";
import { useState, useCallback } from "react";
import WorkspaceSwitcher from "./WorkspaceSwitcher";

export default function ConversationList() {
  // Resizable width state
  const [listWidth, setListWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = listWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(280, Math.min(600, startWidth + delta));
      setListWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [listWidth]);
  const {
    conversations,
    selectedConversation,
    selectConversation,
    loading,
    refreshing,
    refreshProgress,
    pollAndRefresh,
    updateConversationOptimistic,
    pagination,
    nextPage,
    prevPage,
    pageTransitioning,
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
    refreshConversations
  } = useConversations();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const allTags = Array.from(
    new Set(
      conversations.flatMap((conv: Conversation) =>
        (conv.userTags || [])
      )
    )
  ).sort();

  const isUnreplied = (conv: Conversation) => {
    if (conv.needsReply !== undefined) return conv.needsReply;
    if (conv.messages.length === 0) return false;
    const lastMessage = conv.messages[conv.messages.length - 1];
    return lastMessage.direction === "inbound";
  };

  const toggleTag = (tag: string) => {
    const newTags = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag];
    setSelectedTags(newTags);
  };

  const handleStar = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    const conv = conversations.find(c => c.id === convId);
    if (!conv) return;
    updateConversationOptimistic(convId, { starred: !conv.starred });
    try {
      await fetch(`/api/conversations/${convId}/star`, { method: "PATCH" });
      await refreshConversations();
    } catch (error) {
      console.error("Failed to toggle star:", error);
      updateConversationOptimistic(convId, { starred: conv.starred });
    }
  };

  const handleUnarchive = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    const conv = conversations.find(c => c.id === convId);
    if (!conv) return;
    updateConversationOptimistic(convId, { archived: false });
    try {
      const newUserTags = (conv.userTags || []).filter(tag => tag !== "non-customer-support");
      await fetch(`/api/conversations/${convId}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: newUserTags }),
      });
      await fetch(`/api/conversations/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: false }),
      });
      await refreshConversations();
    } catch (error) {
      console.error("Failed to unarchive:", error);
      updateConversationOptimistic(convId, { archived: conv.archived });
    }
  };

  const getPreview = (conv: Conversation) => {
    const lastMessage = conv.messages[conv.messages.length - 1];
    return lastMessage?.bodyText?.slice(0, 90) || "No content";
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    } else if (diffInHours < 168) {
      return date.toLocaleDateString("en-US", { weekday: "short" });
    } else {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
  };

  return (
    <div
      className={`${isCollapsed ? 'w-14' : ''} border-r border-slate-200 bg-white flex flex-col h-full relative transition-all duration-300 shrink-0 z-20`}
      style={!isCollapsed ? { width: `${listWidth}px` } : undefined}
    >
      {/* Resize Handle */}
      {!isCollapsed && (
        <div
          onMouseDown={handleResizeStart}
          className={`absolute right-0 top-0 bottom-0 w-1 hover:w-2 cursor-col-resize z-30 transition-all group ${isResizing ? 'bg-blue-500 w-2' : 'hover:bg-blue-400'}`}
        >
          <div className="absolute inset-y-0 -left-1 -right-1"></div>
        </div>
      )}
      {/* Progress Bar */}
      {refreshing && (
        <div className="absolute top-0 left-0 right-0 z-50">
          <div className="h-0.5 bg-blue-100 overflow-hidden">
            <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${refreshProgress}%` }}></div>
          </div>
        </div>
      )}

      {/* Collapsed Sidebar */}
      {isCollapsed ? (
        <div className="flex flex-col h-full items-center py-4 bg-slate-50 border-r border-slate-200">
          <button onClick={() => setIsCollapsed(false)} className="p-2.5 hover:bg-white hover:shadow-sm rounded-lg transition-all mb-4 text-slate-600" title="Expand">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
          </button>
          <button onClick={() => pollAndRefresh()} className="p-2.5 hover:bg-white hover:shadow-sm rounded-lg transition-all text-slate-600" title="Refresh" disabled={loading}>
            <svg className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
        </div>
      ) : (
        <>
          {/* Header & Controls */}
          <div className="flex flex-col bg-slate-50/50">
            <WorkspaceSwitcher />
            
            <div className="px-4 pb-4 pt-2 border-b border-slate-200">
               {/* Top Bar */}
               <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                     <button onClick={() => setIsCollapsed(true)} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all text-slate-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
                     </button>
                     <div>
                        <h2 className="text-base font-bold text-slate-800">Inbox</h2>
                        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">{conversations.length} Conversations</p>
                     </div>
                  </div>
                  <button 
                     onClick={() => pollAndRefresh()} 
                     disabled={loading || refreshing}
                     className={`p-2 rounded-lg transition-all ${refreshing ? 'bg-blue-50 text-blue-600' : 'hover:bg-white hover:shadow-sm text-slate-500'}`}
                     title="Sync Emails"
                  >
                     <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  </button>
               </div>

               {/* Filter Tabs */}
               <div className="flex items-center gap-1 bg-slate-200/50 p-1 rounded-lg mb-3">
                  <button onClick={() => setStatusFilter('all')} className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${statusFilter === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>All</button>
                  <button onClick={() => setStatusFilter('needs-reply')} className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${statusFilter === 'needs-reply' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Needs Reply</button>
                  <button onClick={() => setStatusFilter('resolved')} className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${statusFilter === 'resolved' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Resolved</button>
               </div>

               {/* Quick Toggles */}
               <div className="flex flex-wrap gap-2">
                  <button onClick={() => setShowStarred(!showStarred)} className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide border transition-all ${showStarred ? 'bg-yellow-50 border-yellow-200 text-yellow-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                     ★ Starred
                  </button>
                  <button onClick={() => setExcludeNonSupport(!excludeNonSupport)} className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide border transition-all ${excludeNonSupport ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                     Support Only
                  </button>
                  <button onClick={() => setAdminOnly(!adminOnly)} className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide border transition-all ${adminOnly ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                     Admin
                  </button>
                  <button onClick={() => setShowFilters(!showFilters)} className={`ml-auto px-2 py-1 rounded-md text-xs border transition-all ${showFilters || selectedTags.length > 0 || dateRange !== 'all' ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                     Filters {selectedTags.length > 0 && `(${selectedTags.length})`}
                  </button>
               </div>

               {/* Expanded Filters */}
               {showFilters && (
                  <div className="mt-3 pt-3 border-t border-slate-200 animate-in fade-in slide-in-from-top-2 duration-200">
                     <div className="space-y-3">
                        <div>
                           <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 block">Date Range</label>
                           <select value={dateRange} onChange={(e) => setDateRange(e.target.value as "all" | "today" | "week" | "month")} className="w-full bg-white border border-slate-200 rounded-md px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                              <option value="all">All Time</option>
                              <option value="today">Last 24 Hours</option>
                              <option value="week">Last 7 Days</option>
                              <option value="month">Last 30 Days</option>
                           </select>
                        </div>
                        {allTags.length > 0 && (
                           <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 block">Tags</label>
                              <div className="flex flex-wrap gap-1.5">
                                 {allTags.map(tag => (
                                    <button 
                                       key={tag} 
                                       onClick={() => toggleTag(tag)}
                                       className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${selectedTags.includes(tag) ? 'bg-slate-700 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                                    >
                                       {tag}
                                    </button>
                                 ))}
                              </div>
                           </div>
                        )}
                        {(selectedTags.length > 0 || dateRange !== 'all') && (
                           <button onClick={() => { setSelectedTags([]); setDateRange('all'); }} className="w-full py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-md transition-colors font-medium">
                              Clear Filters
                           </button>
                        )}
                     </div>
                  </div>
               )}
            </div>
          </div>

          {/* Pagination */}
          {pagination && pagination.total > 0 && (
            <div className="px-4 py-2 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between text-xs font-medium text-slate-500">
               <button onClick={prevPage} disabled={pagination.page === 1 || pageTransitioning} className="hover:text-slate-800 disabled:opacity-30 disabled:hover:text-slate-500 transition-colors">Previous</button>
               <span>Page {pagination.page} of {pagination.totalPages}</span>
               <button onClick={nextPage} disabled={pagination.page === pagination.totalPages || pageTransitioning} className="hover:text-slate-800 disabled:opacity-30 disabled:hover:text-slate-500 transition-colors">Next</button>
            </div>
          )}

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
            {conversations.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-64 text-center p-6">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                     <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  </div>
                  <p className="text-sm font-medium text-slate-900">No conversations found</p>
                  <p className="text-xs text-slate-500 mt-1">Try adjusting your filters</p>
               </div>
            ) : (
               <div className="divide-y divide-slate-100">
                  {conversations.map((conv: Conversation) => {
                     const unreplied = isUnreplied(conv);
                     return (
                        <div 
                           key={conv.id}
                           onClick={() => selectConversation(conv.id)}
                           className={`group relative p-4 cursor-pointer transition-all hover:bg-slate-50 ${selectedConversation?.id === conv.id ? 'bg-blue-50/60 hover:bg-blue-50' : ''} ${unreplied ? 'bg-white' : 'bg-slate-50/30'}`}
                        >
                           {selectedConversation?.id === conv.id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600" />}
                           
                           <div className="flex justify-between items-start mb-1">
                              <div className="flex items-center gap-2 min-w-0">
                                 <button onClick={(e) => handleStar(e, conv.id)} className={`transition-colors ${conv.starred ? 'text-amber-400' : 'text-slate-300 hover:text-amber-400'}`}>
                                    <svg className="w-4 h-4" fill={conv.starred ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363 1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                                 </button>
                                 <span className={`text-sm truncate ${unreplied ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                                    {conv.customer.name || conv.customer.primaryEmail}
                                 </span>
                              </div>
                              <span className={`text-[10px] whitespace-nowrap ${unreplied ? 'font-bold text-blue-600' : 'text-slate-400'}`}>
                                 {formatDate(conv.lastMessageAt)}
                              </span>
                           </div>

                           <div className="pl-6">
                              <h3 className={`text-xs mb-0.5 truncate ${unreplied ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                                 {conv.subject || "(No Subject)"}
                              </h3>
                              <p className="text-xs text-slate-400 line-clamp-2 mb-2">
                                 {getPreview(conv)}
                              </p>
                              
                              <div className="flex flex-wrap gap-1.5 items-center">
                                 {unreplied && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700">
                                       Needs Reply
                                    </span>
                                 )}
                                 {conv.userTags?.slice(0, 3).map(tag => (
                                    <span key={tag} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                       {tag}
                                    </span>
                                 ))}
                                 {conv.archived && (
                                    <button onClick={(e) => handleUnarchive(e, conv.id)} className="text-[10px] font-medium text-slate-400 hover:text-blue-600 underline decoration-slate-300 hover:decoration-blue-600 ml-auto">
                                       Unarchive
                                    </button>
                                 )}
                              </div>
                           </div>
                        </div>
                     );
                  })}
               </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}