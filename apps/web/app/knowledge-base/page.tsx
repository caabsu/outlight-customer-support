"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

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
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");
  const [tags, setTags] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    fetchEntries();
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const tagsArray = tags.split(",").map(t => t.trim()).filter(t => t);

    const payload = {
      title,
      content,
      category,
      tags: tagsArray,
      active
    };

    try {
      if (editingEntry) {
        // Update existing entry
        await fetch(`/api/knowledge-base/${editingEntry.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      } else {
        // Create new entry
        await fetch("/api/knowledge-base", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      }

      // Reset form
      setTitle("");
      setContent("");
      setCategory("general");
      setTags("");
      setActive(true);
      setShowAddForm(false);
      setEditingEntry(null);

      // Refresh list
      fetchEntries();
    } catch (error) {
      console.error("Failed to save entry:", error);
    }
  };

  const handleEdit = (entry: KnowledgeEntry) => {
    setEditingEntry(entry);
    setTitle(entry.title);
    setContent(entry.content);
    setCategory(entry.category);
    setTags(entry.tags.join(", "));
    setActive(entry.active);
    setShowAddForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this entry?")) return;

    try {
      await fetch(`/api/knowledge-base/${id}`, {
        method: "DELETE"
      });
      fetchEntries();
    } catch (error) {
      console.error("Failed to delete entry:", error);
    }
  };

  const handleToggleActive = async (entry: KnowledgeEntry) => {
    try {
      await fetch(`/api/knowledge-base/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !entry.active })
      });
      fetchEntries();
    } catch (error) {
      console.error("Failed to toggle entry:", error);
    }
  };

  const getCategoryBadgeColor = (cat: string) => {
    const colors: Record<string, string> = {
      general: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      summary: "bg-purple-500/10 text-purple-500 border-purple-500/20",
      "draft-reply": "bg-green-500/10 text-green-500 border-green-500/20",
      "suggest-tags": "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
      "find-similar": "bg-pink-500/10 text-pink-500 border-pink-500/20"
    };
    return colors[cat] || colors.general;
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => router.push("/emails")}
              className="flex items-center gap-2 px-3 py-2 text-sm font-sans text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to Emails
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-sans font-bold text-foreground">Knowledge Base</h1>
              <p className="text-sm font-sans text-muted-foreground mt-1">
                Manage AI context and instructions
              </p>
            </div>
            <button
              onClick={() => {
                setEditingEntry(null);
                setTitle("");
                setContent("");
                setCategory("general");
                setTags("");
                setActive(true);
                setShowAddForm(!showAddForm);
              }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-sans font-medium hover:bg-primary/90 transition-colors"
            >
              {showAddForm ? "Cancel" : "+ Add Entry"}
            </button>
          </div>
        </div>

        {/* Add/Edit Form */}
        {showAddForm && (
          <div className="p-6 border-b border-border bg-secondary/30">
            <h2 className="text-lg font-sans font-semibold text-foreground mb-4">
              {editingEntry ? "Edit Entry" : "Add New Entry"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-sans font-medium text-foreground mb-2">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    className="w-full px-3 py-2 font-sans bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="e.g., Return Policy"
                  />
                </div>
                <div>
                  <label className="block text-sm font-sans font-medium text-foreground mb-2">
                    Category *
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 font-sans bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="general">General (All AI Actions)</option>
                    <option value="summary">Summary Only</option>
                    <option value="draft-reply">Draft Reply Only</option>
                    <option value="suggest-tags">Suggest Tags Only</option>
                    <option value="find-similar">Find Similar Only</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-sans font-medium text-foreground mb-2">
                  Content *
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  rows={4}
                  className="w-full px-3 py-2 font-sans bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                  placeholder="Enter the knowledge content that AI should use..."
                />
              </div>

              <div>
                <label className="block text-sm font-sans font-medium text-foreground mb-2">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="w-full px-3 py-2 font-sans bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="e.g., returns, refunds, policy"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="active"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor="active" className="text-sm font-sans text-foreground">
                  Active (AI will use this entry)
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-sans font-medium hover:bg-primary/90 transition-colors"
                >
                  {editingEntry ? "Update Entry" : "Add Entry"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingEntry(null);
                    setTitle("");
                    setContent("");
                    setCategory("general");
                    setTags("");
                    setActive(true);
                  }}
                  className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm font-sans font-medium hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Entries List */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center text-muted-foreground font-sans">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="text-center text-muted-foreground font-sans">
              No knowledge base entries yet. Add your first entry to get started!
            </div>
          ) : (
            <div className="space-y-4">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="p-4 bg-background border border-border rounded-lg hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-sans font-semibold text-foreground">
                          {entry.title}
                        </h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-sans border ${getCategoryBadgeColor(entry.category)}`}>
                          {entry.category}
                        </span>
                        {!entry.active && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-sans bg-muted text-muted-foreground border border-border">
                            Inactive
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-sans text-foreground whitespace-pre-wrap">
                        {entry.content}
                      </p>
                      {entry.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {entry.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 bg-muted text-muted-foreground text-xs font-sans rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => handleToggleActive(entry)}
                        className="px-3 py-1 bg-secondary text-secondary-foreground rounded text-xs font-sans hover:bg-accent transition-colors"
                      >
                        {entry.active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => handleEdit(entry)}
                        className="px-3 py-1 bg-secondary text-secondary-foreground rounded text-xs font-sans hover:bg-accent transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="px-3 py-1 bg-warning/10 text-warning rounded text-xs font-sans hover:bg-warning/20 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="text-xs font-sans text-muted-foreground">
                    Updated {new Date(entry.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
