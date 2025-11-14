import Link from "next/link";

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ colorScheme: 'light' }}>
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/95 backdrop-blur shadow-sm">
        <div className="container mx-auto px-6 py-6">
          <h1 className="text-4xl font-serif text-gray-900">
            outlight
          </h1>
          <p className="text-gray-600 mt-2 font-sans">Internal Support Tool</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-6 py-12">
        {/* Welcome Section */}
        <div className="max-w-3xl mb-16">
          <h2 className="text-5xl font-sans font-bold text-gray-900 mb-6">
            Welcome to <span className="font-serif text-blue-600">outlight</span>
          </h2>
          <p className="text-xl font-sans text-gray-600 leading-relaxed">
            Internal customer support tool for the Outlight lighting brand.
            Manage email conversations, track customer orders, and provide
            exceptional service to our lighting customers, all in one place.
          </p>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl">
          {/* Emails Card */}
          <Link
            href="/emails"
            className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-8 transition-all hover:border-blue-400 hover:shadow-xl hover:shadow-blue-100"
          >
            <div className="relative z-10">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-6 w-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-sans font-semibold text-gray-900 mb-2">
                Emails
              </h3>
              <p className="text-gray-600 font-sans mb-4">
                Manage customer conversations, reply to inquiries, and keep
                track of all support threads.
              </p>
              <span className="inline-flex items-center text-sm font-medium text-blue-600 group-hover:underline">
                Open Inbox
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="ml-1 h-4 w-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                  />
                </svg>
              </span>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>

          {/* External Drafts Card */}
          <Link
            href="/external-drafts"
            className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-8 transition-all hover:border-purple-400 hover:shadow-xl hover:shadow-purple-100"
          >
            <div className="relative z-10">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-6 w-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-sans font-semibold text-gray-900 mb-2">
                External Drafts
              </h3>
              <p className="text-gray-600 font-sans mb-4">
                Generate AI-powered drafts for external emails with custom instructions and concurrent processing.
              </p>
              <span className="inline-flex items-center text-sm font-medium text-purple-600 group-hover:underline">
                Create Draft
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="ml-1 h-4 w-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                  />
                </svg>
              </span>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-purple-50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>

          {/* Knowledge Base Card */}
          <Link
            href="/knowledge-base"
            className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-8 transition-all hover:border-green-400 hover:shadow-xl hover:shadow-green-100"
          >
            <div className="relative z-10">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-green-50 text-green-600">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-6 w-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-sans font-semibold text-gray-900 mb-2">
                Knowledge Base
              </h3>
              <p className="text-gray-600 font-sans mb-4">
                Manage support articles, policies, and AI training content for draft generation.
              </p>
              <span className="inline-flex items-center text-sm font-medium text-green-600 group-hover:underline">
                View Articles
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="ml-1 h-4 w-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                  />
                </svg>
              </span>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>

          {/* Product Knowledge Base Card */}
          <Link
            href="/products"
            className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-8 transition-all hover:border-teal-400 hover:shadow-xl hover:shadow-teal-100"
          >
            <div className="relative z-10">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-6 w-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-sans font-semibold text-gray-900 mb-2">
                Product Knowledge Base
              </h3>
              <p className="text-gray-600 font-sans mb-4">
                Manage product details, specifications, shipping times, and warranties for AI-powered support.
              </p>
              <span className="inline-flex items-center text-sm font-medium text-teal-600 group-hover:underline">
                Manage Products
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="ml-1 h-4 w-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                  />
                </svg>
              </span>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-teal-50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>

          {/* Training & Onboarding Card */}
          <Link
            href="/onboarding"
            className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-8 transition-all hover:border-indigo-400 hover:shadow-xl hover:shadow-indigo-100"
          >
            <div className="relative z-10">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-6 w-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5"
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-sans font-semibold text-gray-900 mb-2">
                Training & Onboarding
              </h3>
              <p className="text-gray-600 font-sans mb-4">
                Complete SOPs, training videos, and guides for customer support agents.
              </p>
              <span className="inline-flex items-center text-sm font-medium text-indigo-600 group-hover:underline">
                Start Learning
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="ml-1 h-4 w-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                  />
                </svg>
              </span>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>

          {/* Questions KB Card */}
          <Link
            href="/questions"
            className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-8 transition-all hover:border-orange-400 hover:shadow-xl hover:shadow-orange-100"
          >
            <div className="relative z-10">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-6 w-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-sans font-semibold text-gray-900 mb-2">
                Questions KB
              </h3>
              <p className="text-gray-600 font-sans mb-4">
                Internal knowledge base for team questions. Ask questions and get answers from colleagues.
              </p>
              <span className="inline-flex items-center text-sm font-medium text-orange-600 group-hover:underline">
                Browse Questions
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="ml-1 h-4 w-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                  />
                </svg>
              </span>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>

          {/* Analytics Card */}
          <Link
            href="/analytics"
            className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-8 transition-all hover:border-amber-400 hover:shadow-xl hover:shadow-amber-100"
          >
            <div className="relative z-10">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-6 w-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-sans font-semibold text-gray-900 mb-2">
                Analytics
              </h3>
              <p className="text-gray-600 font-sans mb-4">
                Track response times, email volume, and customer satisfaction
                metrics.
              </p>
              <span className="inline-flex items-center text-sm font-medium text-amber-600 group-hover:underline">
                View Dashboard
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="ml-1 h-4 w-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                  />
                </svg>
              </span>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-amber-50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>

          {/* Settings Card */}
          <div className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 p-8 opacity-60 cursor-not-allowed">
            <div className="relative z-10">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gray-200 text-gray-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-6 w-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-sans font-semibold text-gray-700 mb-2">
                Settings
              </h3>
              <p className="text-gray-500 font-sans mb-4">
                Configure your account, manage team members, and customize
                workflows.
              </p>
              <span className="inline-flex items-center text-sm font-medium text-gray-400">
                Coming Soon
              </span>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="mt-16 max-w-6xl">
          <h3 className="text-2xl font-sans font-semibold text-gray-900 mb-6">
            Quick Overview
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="text-3xl font-bold text-blue-600 mb-1">—</div>
              <div className="text-sm text-gray-600">
                Active Conversations
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="text-3xl font-bold text-amber-600 mb-1">—</div>
              <div className="text-sm text-gray-600">
                Awaiting Reply
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="text-3xl font-bold text-green-600 mb-1">—</div>
              <div className="text-sm text-gray-600">
                Resolved Today
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-8 mt-auto">
        <div className="container mx-auto px-6 text-center text-sm text-gray-600 font-sans">
          <p>&copy; 2025 <span className="font-serif text-blue-600">outlight</span>. Internal tool for our lighting support team.</p>
        </div>
      </footer>
    </div>
  );
}
