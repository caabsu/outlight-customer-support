"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useCurrentUser } from "@/components/AuthProvider";

interface User {
  id: string;
  name: string;
  username: string;
}

interface Question {
  id: string;
  question: string;
  answer: string | null;
  askedBy: string;
  answeredBy: string | null;
  referencedEmail: string | null;
  status: string;
  createdAt: string;
  answeredAt: string | null;
  askedByUser: User;
  answeredByUser: User | null;
}

export default function QuestionsKBPage() {
  const currentUser = useCurrentUser();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [filteredQuestions, setFilteredQuestions] = useState<Question[]>([]);
  const [filter, setFilter] = useState<"all" | "answered" | "unanswered">("all");
  const [loading, setLoading] = useState(true);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [showAskModal, setShowAskModal] = useState(false);
  const [newQuestion, setNewQuestion] = useState({
    question: "",
    referencedEmail: "",
  });

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  useEffect(() => {
    fetchQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    applyFilter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, filter]);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/questions`);
      const data = await response.json();
      setQuestions(data);
    } catch (error) {
      console.error("Error fetching questions:", error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilter = () => {
    if (filter === "all") {
      setFilteredQuestions(questions);
    } else {
      setFilteredQuestions(questions.filter((q) => q.status === filter));
    }
  };

  const handleAskQuestion = async () => {
    if (!newQuestion.question.trim() || !currentUser) return;

    try {
      const response = await fetch(`${API_BASE_URL}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: newQuestion.question,
          askedBy: currentUser.id,
          referencedEmail: newQuestion.referencedEmail || null,
        }),
      });

      if (response.ok) {
        await fetchQuestions();
        setShowAskModal(false);
        setNewQuestion({ question: "", referencedEmail: "" });
      }
    } catch (error) {
      console.error("Error asking question:", error);
    }
  };

  const handleAnswer = async (questionId: string) => {
    if (!answerText.trim() || !currentUser) return;

    try {
      const response = await fetch(`${API_BASE_URL}/questions/${questionId}/answer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answer: answerText,
          answeredBy: currentUser.id,
        }),
      });

      if (response.ok) {
        await fetchQuestions();
        setSelectedQuestion(null);
        setAnswerText("");
      }
    } catch (error) {
      console.error("Error answering question:", error);
    }
  };

  const handleDelete = async (questionId: string) => {
    if (!confirm("Are you sure you want to delete this question? This action cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/questions/${questionId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await fetchQuestions();
      } else {
        alert("Failed to delete question. Please try again.");
      }
    } catch (error) {
      console.error("Error deleting question:", error);
      alert("Failed to delete question. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-40">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Link href="/" className="text-3xl font-serif text-gray-900 hover:text-blue-600 transition-colors">
                outlight
              </Link>
              <p className="text-gray-600 mt-1 text-sm">Internal Questions KB</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowAskModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                + Ask Question
              </button>
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
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        {/* Filters */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === "all" ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            All ({questions.length})
          </button>
          <button
            onClick={() => setFilter("answered")}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === "answered" ? "bg-green-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            Answered ({questions.filter((q) => q.status === "answered").length})
          </button>
          <button
            onClick={() => setFilter("unanswered")}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === "unanswered" ? "bg-orange-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            Unanswered ({questions.filter((q) => q.status === "unanswered").length})
          </button>
        </div>

        {/* Questions List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredQuestions.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-500">No questions found. Click &ldquo;Ask Question&rdquo; to get started!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredQuestions.map((question) => (
              <div key={question.id} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
                {/* Question Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{question.question}</h3>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span>Asked by <strong>{question.askedByUser.name}</strong></span>
                      <span>•</span>
                      <span>{new Date(question.createdAt).toLocaleDateString()}</span>
                      {question.status === "answered" && question.answeredByUser && (
                        <>
                          <span>•</span>
                          <span className="text-green-600">
                            Answered by <strong>{question.answeredByUser.name}</strong>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        question.status === "answered"
                          ? "bg-green-100 text-green-800"
                          : "bg-orange-100 text-orange-800"
                      }`}
                    >
                      {question.status}
                    </span>
                    <button
                      onClick={() => handleDelete(question.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete question"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Answer */}
                {question.answer ? (
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Answer:</p>
                    <p className="text-gray-900 whitespace-pre-wrap">{question.answer}</p>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setSelectedQuestion(question);
                      setAnswerText("");
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium mb-4"
                  >
                    Answer This Question
                  </button>
                )}

                {/* Referenced Email */}
                {question.referencedEmail && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700">
                      View Referenced Email
                    </summary>
                    <div className="mt-2 bg-blue-50 rounded-lg p-4 text-sm font-mono text-gray-800 overflow-x-auto">
                      <pre className="whitespace-pre-wrap">{question.referencedEmail}</pre>
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ask Question Modal */}
      {showAskModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Ask a Question</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Question</label>
                <textarea
                  value={newQuestion.question}
                  onChange={(e) => setNewQuestion({ ...newQuestion, question: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="What do you need help with?"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Referenced Email (Optional)
                </label>
                <textarea
                  value={newQuestion.referencedEmail}
                  onChange={(e) => setNewQuestion({ ...newQuestion, referencedEmail: e.target.value })}
                  rows={6}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  placeholder="Paste relevant email content here..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleAskQuestion}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Submit Question
                </button>
                <button
                  onClick={() => {
                    setShowAskModal(false);
                    setNewQuestion({ question: "", referencedEmail: "" });
                  }}
                  className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Answer Modal */}
      {selectedQuestion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Answer Question</h2>
            <p className="text-gray-700 mb-4 font-medium">{selectedQuestion.question}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Your Answer</label>
                <textarea
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  rows={8}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Provide a detailed answer..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleAnswer(selectedQuestion.id)}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                >
                  Submit Answer
                </button>
                <button
                  onClick={() => {
                    setSelectedQuestion(null);
                    setAnswerText("");
                  }}
                  className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
