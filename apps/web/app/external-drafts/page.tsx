'use client';

import { useState, useEffect } from 'react';

interface StandaloneDraft {
  id: string;
  subject: string;
  emailBody: string;
  contextNotes: string | null;
  customInstructions: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  internalReasoning: string | null;
  tags: string[];
  category: string | null;
  reasoning: string | null;
  shouldDraft: boolean;
  draft: string | null;
  actionSteps: any | null;
  orderInfo: any | null;
  processingTime: string | null;
  toolCallsMade: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export default function ExternalDraftsPage() {
  const [drafts, setDrafts] = useState<StandaloneDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDraft, setSelectedDraft] = useState<StandaloneDraft | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Form state
  const [subject, setSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [contextNotes, setContextNotes] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [creating, setCreating] = useState(false);

  // Fetch drafts
  const fetchDrafts = async () => {
    try {
      const apiUrl = process.env.NODE_ENV === 'development'
        ? 'http://localhost:3001/standalone-drafts'
        : '/api/standalone-drafts';

      const res = await fetch(apiUrl);
      if (!res.ok) throw new Error('Failed to fetch drafts');
      const data = await res.json();
      setDrafts(data.drafts || []);
    } catch (error) {
      console.error('Error fetching drafts:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh for processing drafts
  useEffect(() => {
    fetchDrafts();

    if (!autoRefresh) return;

    const interval = setInterval(() => {
      // Only refresh if there are pending or processing drafts
      const hasActiveProcessing = drafts.some(d => d.status === 'pending' || d.status === 'processing');
      if (hasActiveProcessing) {
        fetchDrafts();
      }
    }, 2000); // Check every 2 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, drafts.length]);

  // Create new draft
  const handleCreate = async () => {
    if (!subject.trim() || !emailBody.trim()) {
      alert('Subject and Email Body are required');
      return;
    }

    setCreating(true);
    try {
      const apiUrl = process.env.NODE_ENV === 'development'
        ? 'http://localhost:3001/standalone-drafts'
        : '/api/standalone-drafts';

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          emailBody,
          contextNotes: contextNotes.trim() || null,
          customInstructions: customInstructions.trim() || null,
        }),
      });

      if (!res.ok) throw new Error('Failed to create draft');

      // Clear form
      setSubject('');
      setEmailBody('');
      setContextNotes('');
      setCustomInstructions('');
      setShowCreateModal(false);

      // Refresh list
      fetchDrafts();
    } catch (error) {
      console.error('Error creating draft:', error);
      alert('Failed to create draft');
    } finally {
      setCreating(false);
    }
  };

  // Delete draft
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this draft?')) return;

    try {
      const apiUrl = process.env.NODE_ENV === 'development'
        ? `http://localhost:3001/standalone-drafts/${id}`
        : `/api/standalone-drafts/${id}`;

      const res = await fetch(apiUrl, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');

      setDrafts(drafts.filter(d => d.id !== id));
      if (selectedDraft?.id === id) {
        setSelectedDraft(null);
      }
    } catch (error) {
      console.error('Error deleting draft:', error);
      alert('Failed to delete draft');
    }
  };

  // Regenerate draft
  const handleRegenerate = async (id: string) => {
    try {
      const apiUrl = process.env.NODE_ENV === 'development'
        ? `http://localhost:3001/standalone-drafts/${id}/regenerate`
        : `/api/standalone-drafts/${id}/regenerate`;

      const res = await fetch(apiUrl, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to regenerate');

      // Refresh list
      fetchDrafts();
    } catch (error) {
      console.error('Error regenerating draft:', error);
      alert('Failed to regenerate draft');
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">Pending</span>;
      case 'processing':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700 flex items-center gap-1">
          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
          </svg>
          Processing
        </span>;
      case 'completed':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700">Completed</span>;
      case 'failed':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">Failed</span>;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">External Email Drafts</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">Generate AI drafts for emails from outside your connected inbox</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-3 py-2 text-sm font-medium rounded-md ${
                  autoRefresh
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700'
                    : 'bg-gray-100 dark:bg-gray-700 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
                }`}
              >
                {autoRefresh ? '🔄 Auto-refresh ON' : '⏸️ Auto-refresh OFF'}
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 transition-colors shadow-sm"
              >
                + New Draft
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">Loading drafts...</p>
          </div>
        ) : drafts.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500 dark:text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">No drafts yet</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">Get started by creating your first external email draft</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700"
            >
              Create Draft
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Drafts List */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide px-1">All Drafts ({drafts.length})</h2>
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  onClick={() => setSelectedDraft(draft)}
                  className={`bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border-2 cursor-pointer transition-all ${
                    selectedDraft?.id === draft.id
                      ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800'
                      : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 dark:hover:border-blue-700'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm line-clamp-1">{draft.subject}</h3>
                    {getStatusBadge(draft.status)}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">{draft.emailBody}</p>
                  <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 dark:text-gray-400 dark:text-gray-500">
                    <span>{new Date(draft.createdAt).toLocaleString()}</span>
                    {draft.processingTime && <span className="text-green-600 dark:text-green-400 font-medium">{draft.processingTime}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Draft Details */}
            <div className="lg:sticky lg:top-6 lg:h-[calc(100vh-8rem)]">
              {selectedDraft ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden h-full flex flex-col">
                  {/* Header */}
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{selectedDraft.subject}</h2>
                        {getStatusBadge(selectedDraft.status)}
                      </div>
                      <button
                        onClick={() => setSelectedDraft(null)}
                        className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedDraft.status === 'completed' && (
                        <button
                          onClick={() => handleRegenerate(selectedDraft.id)}
                          className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Regenerate
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(selectedDraft.id)}
                        className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Original Email */}
                    <div>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Original Email</h3>
                      <div className="bg-gray-50 p-3 rounded border border-gray-200 text-sm">
                        <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">{selectedDraft.emailBody}</p>
                      </div>
                    </div>

                    {/* Context Notes */}
                    {selectedDraft.contextNotes && (
                      <div>
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Context Notes</h3>
                        <div className="bg-yellow-50 p-3 rounded border border-yellow-200 text-sm">
                          <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">{selectedDraft.contextNotes}</p>
                        </div>
                      </div>
                    )}

                    {/* Custom Instructions */}
                    {selectedDraft.customInstructions && (
                      <div>
                        <h3 className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-2">🔴 Custom Instructions</h3>
                        <div className="bg-orange-50 p-3 rounded border border-orange-200 text-sm">
                          <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">{selectedDraft.customInstructions}</p>
                        </div>
                      </div>
                    )}

                    {/* Error */}
                    {selectedDraft.status === 'failed' && selectedDraft.error && (
                      <div>
                        <h3 className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">Error</h3>
                        <div className="bg-red-50 p-3 rounded border border-red-200 text-sm">
                          <p className="text-red-700 font-mono">{selectedDraft.error}</p>
                        </div>
                      </div>
                    )}

                    {/* AI Results */}
                    {selectedDraft.status === 'completed' && (
                      <>
                        {/* Category & Tags */}
                        {(selectedDraft.category || selectedDraft.tags.length > 0) && (
                          <div>
                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Category & Tags</h3>
                            <div className="flex flex-wrap gap-2">
                              {selectedDraft.category && (
                                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-semibold rounded">
                                  {selectedDraft.category}
                                </span>
                              )}
                              {selectedDraft.tags.map((tag, i) => (
                                <span key={i} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* AI Reasoning */}
                        {selectedDraft.reasoning && (
                          <div>
                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">AI Reasoning</h3>
                            <div className="bg-blue-50 p-3 rounded border border-blue-200 text-sm">
                              <p className="text-gray-700 dark:text-gray-300">{selectedDraft.reasoning}</p>
                            </div>
                          </div>
                        )}

                        {/* Internal Reasoning */}
                        {selectedDraft.internalReasoning && (
                          <details className="group">
                            <summary className="text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 dark:text-gray-300">
                              Internal Reasoning (Click to expand)
                            </summary>
                            <div className="mt-2 bg-gray-50 p-3 rounded border border-gray-200 text-sm">
                              <p className="whitespace-pre-wrap text-gray-600 font-mono text-xs">{selectedDraft.internalReasoning}</p>
                            </div>
                          </details>
                        )}

                        {/* Order Info */}
                        {selectedDraft.orderInfo && (
                          <div>
                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Order Information</h3>
                            <div className="bg-green-50 p-3 rounded border border-green-200 text-sm space-y-1">
                              {Object.entries(selectedDraft.orderInfo).map(([key, value]) => (
                                <div key={key} className="flex justify-between">
                                  <span className="text-gray-600 font-medium">{key}:</span>
                                  <span className="text-gray-900 dark:text-white">{String(value)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Draft */}
                        {selectedDraft.draft && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email Draft</h3>
                              <button
                                onClick={() => copyToClipboard(selectedDraft.draft!)}
                                className="px-2 py-1 text-xs font-medium bg-gray-600 text-white rounded hover:bg-gray-700"
                              >
                                📋 Copy
                              </button>
                            </div>
                            <div className="bg-white p-4 rounded border-2 border-green-500 text-sm">
                              <p className="whitespace-pre-wrap text-gray-900 leading-relaxed">{selectedDraft.draft}</p>
                            </div>
                          </div>
                        )}

                        {/* Action Steps */}
                        {selectedDraft.actionSteps && (
                          <div>
                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Action Steps</h3>
                            <div className="bg-yellow-50 p-3 rounded border border-yellow-200 text-sm">
                              <ol className="list-decimal list-inside space-y-1">
                                {(Array.isArray(selectedDraft.actionSteps)
                                  ? selectedDraft.actionSteps
                                  : [selectedDraft.actionSteps]).map((step, i) => (
                                  <li key={i} className="text-gray-700 dark:text-gray-300">{String(step)}</li>
                                ))}
                              </ol>
                            </div>
                          </div>
                        )}

                        {/* Metadata */}
                        <div className="pt-4 border-t border-gray-200 text-xs text-gray-500 space-y-1">
                          <div className="flex justify-between">
                            <span>Processing Time:</span>
                            <span className="font-medium text-green-600">{selectedDraft.processingTime}</span>
                          </div>
                          {selectedDraft.toolCallsMade !== null && selectedDraft.toolCallsMade > 0 && (
                            <div className="flex justify-between">
                              <span>Tool Calls:</span>
                              <span className="font-medium">{selectedDraft.toolCallsMade}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span>Created:</span>
                            <span>{new Date(selectedDraft.createdAt).toLocaleString()}</span>
                          </div>
                          {selectedDraft.completedAt && (
                            <div className="flex justify-between">
                              <span>Completed:</span>
                              <span>{new Date(selectedDraft.completedAt).toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-full flex items-center justify-center">
                  <div className="text-center text-gray-400 dark:text-gray-500">
                    <svg className="mx-auto h-12 w-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                    </svg>
                    <p className="text-sm">Select a draft to view details</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Create New Draft</h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:text-gray-500"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Subject */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Subject <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject line"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Email Body */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Email Body <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  placeholder="Paste the email body you received..."
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
              </div>

              {/* Context Notes */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Context Notes <span className="text-gray-400 text-xs">(optional)</span>
                </label>
                <textarea
                  value={contextNotes}
                  onChange={(e) => setContextNotes(e.target.value)}
                  placeholder="Any additional context or background information..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              {/* Custom Instructions */}
              <div>
                <label className="block text-sm font-semibold text-orange-600 mb-1">
                  🔴 Custom Instructions <span className="text-gray-400 text-xs">(optional, highest priority)</span>
                </label>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="Specific instructions for the AI (e.g., tone, specific information to include, etc.)..."
                  rows={3}
                  className="w-full px-3 py-2 border border-orange-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 bg-orange-50 text-sm"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                disabled={creating}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !subject.trim() || !emailBody.trim()}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Creating...' : 'Create & Generate Draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
