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
    <div className="px-4 py-3 border-b border-gray-200 bg-white">
      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
        Workspace
      </label>
      <select
        value={currentWorkspaceId || ""}
        onChange={(e) => setCurrentWorkspaceId(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name} ({workspace.gmailAccountEmail})
            {!workspace.isAuthorized && " - Not Authorized"}
          </option>
        ))}
      </select>

      {needsAuth && (
        <a
          href={`/api/oauth/google/workspace/${currentWorkspaceId}`}
          className="mt-2 block w-full px-3 py-2 bg-blue-600 text-white text-center rounded-md text-sm font-medium hover:bg-blue-700"
        >
          Authorize Gmail Access
        </a>
      )}
    </div>
  );
}
