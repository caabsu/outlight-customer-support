"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface OnboardingSection {
  id: string;
  title: string;
  slug: string;
  content: string;
  order: number;
  category: string;
  icon?: string;
}

export default function OnboardingPage() {
  const [toolSections, setToolSections] = useState<OnboardingSection[]>([]);
  const [generalSections, setGeneralSections] = useState<OnboardingSection[]>([]);
  const [activeTab, setActiveTab] = useState<"tool" | "general">("tool");
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingSection, setEditingSection] = useState<OnboardingSection | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSections = async () => {
    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_BASE_URL}/onboarding/sections`);
      const data = await response.json();

      setToolSections(data.filter((s: OnboardingSection) => s.category === "tool-sop"));
      setGeneralSections(data.filter((s: OnboardingSection) => s.category === "general-sop"));

      // Set first section as active if none selected
      if (!activeSection && data.length > 0) {
        setActiveSection(data[0].slug);
      }
    } catch (error) {
      console.error("Error fetching sections:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentSections = activeTab === "tool" ? toolSections : generalSections;
  const currentSection = currentSections.find(s => s.slug === activeSection);

  const handleSave = async () => {
    if (!editingSection) return;

    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_BASE_URL}/onboarding/sections/${editingSection.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editingSection.title,
          content: editingSection.content,
        }),
      });

      if (response.ok) {
        await fetchSections();
        setIsEditMode(false);
        setEditingSection(null);
      }
    } catch (error) {
      console.error("Error saving section:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading training materials...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ colorScheme: 'light' }}>
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/95 backdrop-blur shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Link href="/" className="text-3xl font-serif text-gray-900 hover:text-blue-600 transition-colors">
                outlight
              </Link>
              <p className="text-gray-600 mt-1 font-sans text-sm">Training & Onboarding Center</p>
            </div>
            <Link
              href="/"
              className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8 flex gap-8">
        {/* Sidebar Navigation */}
        <aside className="w-80 flex-shrink-0">
          <div className="sticky top-24 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            {/* Tab Switcher */}
            <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => {
                  setActiveTab("tool");
                  if (toolSections.length > 0) setActiveSection(toolSections[0].slug);
                }}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                  activeTab === "tool"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Tool SOP
              </button>
              <button
                onClick={() => {
                  setActiveTab("general");
                  if (generalSections.length > 0) setActiveSection(generalSections[0].slug);
                }}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                  activeTab === "general"
                    ? "bg-white text-green-600 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                General SOP
              </button>
            </div>

            {/* Navigation Links */}
            <nav className="space-y-1">
              {currentSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.slug)}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    activeSection === section.slug
                      ? activeTab === "tool"
                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                        : "bg-green-50 text-green-700 border border-green-200"
                      : "text-gray-700 hover:bg-gray-50 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {section.icon && <span>{section.icon}</span>}
                    <span>{section.title}</span>
                  </div>
                </button>
              ))}
            </nav>

            {/* Quick Links */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Quick Access
              </h3>
              <Link
                href="/onboarding/videos"
                className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium text-gray-700 hover:bg-purple-50 hover:text-purple-700 border border-transparent hover:border-purple-200 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                Training Videos
              </Link>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            {currentSection && (
              <>
                {/* Section Header */}
                <div className={`px-8 py-6 border-b border-gray-200 ${
                  activeTab === "tool" ? "bg-blue-50" : "bg-green-50"
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h1 className="text-3xl font-bold text-gray-900">
                        {isEditMode && editingSection ? (
                          <input
                            type="text"
                            value={editingSection.title}
                            onChange={(e) => setEditingSection({ ...editingSection, title: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                          />
                        ) : (
                          currentSection.title
                        )}
                      </h1>
                      <p className="text-sm text-gray-600 mt-1">
                        {activeTab === "tool" ? "Customer Support Tool Guide" : "General Support Procedures"}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (isEditMode) {
                          if (editingSection) {
                            handleSave();
                          }
                        } else {
                          setIsEditMode(true);
                          setEditingSection(currentSection);
                        }
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        isEditMode
                          ? "bg-green-600 text-white hover:bg-green-700"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {isEditMode ? "💾 Save Changes" : "✏️ Edit"}
                    </button>
                  </div>
                </div>

                {/* Section Content */}
                <div className="px-8 py-8">
                  {isEditMode && editingSection ? (
                    <div className="space-y-4">
                      <label className="block">
                        <span className="text-sm font-medium text-gray-700 mb-2 block">Content (Markdown supported)</span>
                        <textarea
                          value={editingSection.content}
                          onChange={(e) => setEditingSection({ ...editingSection, content: e.target.value })}
                          rows={20}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg font-mono text-sm"
                        />
                      </label>
                      <div className="flex gap-3">
                        <button
                          onClick={handleSave}
                          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                        >
                          Save Changes
                        </button>
                        <button
                          onClick={() => {
                            setIsEditMode(false);
                            setEditingSection(null);
                          }}
                          className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="onboarding-content"
                      dangerouslySetInnerHTML={{ __html: formatContent(currentSection.content) }}
                    />
                  )}
                </div>
              </>
            )}

            {!currentSection && (
              <div className="px-8 py-16 text-center text-gray-500">
                <p>No content available yet. Click &ldquo;Edit&rdquo; to add content.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// Enhanced markdown formatter with better styling
function formatContent(content: string): string {
  // STEP 1: Normalize line endings FIRST before any processing
  let html = content.replace(/\r\n/g, '\n');

  // STEP 2: Process code blocks (must be before other replacements)
  html = html.replace(/```([\s\S]*?)```/g, '<pre class="code-block"><code>$1</code></pre>');

  // STEP 3: Process headers
  html = html.replace(/^### (.+)$/gm, '<h3 class="section-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="section-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="section-h1">$1</h1>');

  // STEP 4: Process inline formatting (bold, italic, code, links)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-gray-900">$1</strong>');
  html = html.replace(/\*([^*]+?)\*/g, '<em class="italic text-gray-700">$1</em>');
  html = html.replace(/`([^`]+?)`/g, '<code class="inline-code">$1</code>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer">$1</a>');

  // STEP 5: Process lists - group consecutive numbered/bullet items
  // Split into lines for processing
  const lines = html.split('\n');
  const processedLines: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Check for numbered list start
    if (line.match(/^\d+\.\s+/)) {
      const listItems: string[] = [];
      // Collect all consecutive numbered items (allowing blank lines between them)
      while (i < lines.length) {
        const currentLine = lines[i];
        if (currentLine.match(/^\d+\.\s+/)) {
          const match = currentLine.match(/^(\d+)\.\s+(.+)$/);
          if (match) {
            listItems.push(`<li class="list-item">${match[2]}</li>`);
          }
          i++;
        } else if (currentLine.trim() === '' && i + 1 < lines.length && lines[i + 1].match(/^\d+\.\s+/)) {
          // Skip blank lines between numbered items
          i++;
        } else {
          // End of numbered list
          break;
        }
      }
      if (listItems.length > 0) {
        processedLines.push(`<ol class="custom-list custom-list-numbered">${listItems.join('')}</ol>`);
      }
      continue;
    }

    // Check for bullet list start
    if (line.match(/^-\s+/)) {
      const listItems: string[] = [];
      // Collect all consecutive bullet items (allowing blank lines between them)
      while (i < lines.length) {
        const currentLine = lines[i];
        if (currentLine.match(/^-\s+/)) {
          const match = currentLine.match(/^-\s+(.+)$/);
          if (match) {
            listItems.push(`<li class="list-item">${match[1]}</li>`);
          }
          i++;
        } else if (currentLine.trim() === '' && i + 1 < lines.length && lines[i + 1].match(/^-\s+/)) {
          // Skip blank lines between bullet items
          i++;
        } else {
          // End of bullet list
          break;
        }
      }
      if (listItems.length > 0) {
        processedLines.push(`<ul class="custom-list">${listItems.join('')}</ul>`);
      }
      continue;
    }

    // Regular line
    processedLines.push(line);
    i++;
  }

  // STEP 6: Re-join and split into blocks for paragraph handling
  html = processedLines.join('\n');
  const blocks = html.split(/\n\n+/);
  const processedBlocks = blocks.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';

    // Already processed elements (headers, code blocks, lists)
    if (trimmed.match(/^<(h[123]|pre|ul|ol)/)) {
      return trimmed;
    }

    // Regular paragraphs
    const withBreaks = trimmed.replace(/\n/g, '<br>');
    return `<p class="paragraph">${withBreaks}</p>`;
  });

  return `
    <style>
      .onboarding-content {
        line-height: 1.8;
        color: #374151;
      }

      .section-h1 {
        font-size: 2rem;
        font-weight: 700;
        color: #111827;
        margin-top: 2rem;
        margin-bottom: 1rem;
        padding-bottom: 0.5rem;
        border-bottom: 2px solid #e5e7eb;
      }

      .section-h2 {
        font-size: 1.5rem;
        font-weight: 700;
        color: #1f2937;
        margin-top: 2rem;
        margin-bottom: 1rem;
        padding-bottom: 0.25rem;
        border-bottom: 1px solid #e5e7eb;
      }

      .section-h3 {
        font-size: 1.25rem;
        font-weight: 600;
        color: #374151;
        margin-top: 1.5rem;
        margin-bottom: 0.75rem;
      }

      .paragraph {
        margin-bottom: 1rem;
        font-size: 1rem;
        line-height: 1.75;
        color: #4b5563;
      }

      .custom-list {
        margin-bottom: 1.5rem;
        margin-left: 1.5rem;
        list-style-type: disc;
      }

      .custom-list-numbered {
        list-style-type: decimal;
      }

      .list-item {
        margin-bottom: 0.75rem;
        padding-left: 0.5rem;
        color: #4b5563;
        line-height: 1.7;
        display: list-item;
      }

      .list-item:last-child {
        margin-bottom: 0;
      }

      .list-item strong {
        color: #111827;
        font-weight: 600;
      }

      /* Ensure lists show markers */
      .custom-list {
        display: block;
      }

      .custom-list li {
        display: list-item;
      }

      .inline-code {
        background-color: #f3f4f6;
        color: #dc2626;
        padding: 0.125rem 0.375rem;
        border-radius: 0.25rem;
        font-family: 'Courier New', monospace;
        font-size: 0.875rem;
        font-weight: 500;
      }

      .code-block {
        background-color: #1f2937;
        color: #f9fafb;
        padding: 1rem;
        border-radius: 0.5rem;
        overflow-x: auto;
        margin: 1.5rem 0;
        font-family: 'Courier New', monospace;
        font-size: 0.875rem;
        line-height: 1.5;
      }

      .code-block code {
        color: #f9fafb;
      }

      /* Special formatting for checkmarks and emojis */
      .onboarding-content strong:first-child {
        display: inline-block;
        margin-right: 0.25rem;
      }

      /* Links */
      .onboarding-content a {
        font-weight: 500;
      }

      /* Spacing adjustments */
      .onboarding-content > *:first-child {
        margin-top: 0;
      }

      .onboarding-content > *:last-child {
        margin-bottom: 0;
      }

      /* Better readability for nested lists */
      .custom-list .custom-list {
        margin-top: 0.5rem;
        margin-left: 1rem;
      }
    </style>
    ${processedBlocks.join('\n')}
  `;
}
