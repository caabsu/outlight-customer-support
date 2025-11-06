"use client";

import { useConversations } from "@/lib/ConversationContext";

export default function WorkspaceSwitcher() {
  const {
    workspaces,
    currentWorkspaceId,
    setCurrentWorkspaceId,
  } = useConversations();

  if (workspaces.length === 0) {
    return null; // Don't show anything until workspaces are loaded
  }

  const currentWorkspace = workspaces.find(w => w.id === currentWorkspaceId);
  const needsAuth = currentWorkspace && !currentWorkspace.isAuthorized;

  return (
    <div className="px-4 py-4 border-b-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* Header with icon */}
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
          Workspace
        </h3>
      </div>

      {/* Custom styled select wrapper */}
      <div className="relative">
        <select
          value={currentWorkspaceId || ""}
          onChange={(e) => setCurrentWorkspaceId(e.target.value)}
          className="w-full px-4 py-3 bg-white border-2 border-blue-300 rounded-lg text-base font-semibold text-gray-800 appearance-none cursor-pointer hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
        >
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name} • {workspace.gmailAccountEmail}
              {!workspace.isAuthorized && " ⚠️ NOT AUTHORIZED"}
            </option>
          ))}
        </select>
        {/* Custom dropdown arrow */}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-blue-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Workspace count badge */}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">
          {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''} available
        </span>
        {currentWorkspace?.isAuthorized && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Connected
          </span>
        )}
      </div>

      {/* Authorization button */}
      {needsAuth && (
        <a
          href={`/api/oauth/google/workspace/${currentWorkspaceId}`}
          className="mt-3 block w-full px-4 py-3 bg-gradient-to-r from-red-600 to-orange-600 text-white text-center rounded-lg text-sm font-bold hover:from-red-700 hover:to-orange-700 transition-all shadow-md hover:shadow-lg transform hover:scale-[1.02] flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          ⚠️ AUTHORIZE GMAIL ACCESS
        </a>
      )}
    </div>
  );
}
