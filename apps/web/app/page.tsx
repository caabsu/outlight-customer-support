import Link from "next/link";

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-6 py-6">
          <h1 className="text-4xl font-serif font-bold text-foreground">
            Outlight
          </h1>
          <p className="text-muted-foreground mt-2">Customer Support Platform</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-6 py-12">
        {/* Welcome Section */}
        <div className="max-w-3xl mb-16">
          <h2 className="text-5xl font-serif font-bold text-foreground mb-6">
            Welcome to Outlight
          </h2>
          <p className="text-xl text-muted-foreground leading-relaxed">
            Streamline your customer support with intelligent email management,
            automated tagging, and powerful insights. Everything you need to
            provide exceptional customer service, all in one place.
          </p>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl">
          {/* Emails Card */}
          <Link
            href="/emails"
            className="group relative overflow-hidden rounded-2xl border border-border bg-secondary p-8 transition-all hover:border-primary hover:shadow-lg hover:shadow-primary/10"
          >
            <div className="relative z-10">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
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
              <h3 className="text-2xl font-serif font-semibold text-foreground mb-2">
                Emails
              </h3>
              <p className="text-muted-foreground mb-4">
                Manage customer conversations, reply to inquiries, and keep
                track of all support threads.
              </p>
              <span className="inline-flex items-center text-sm font-medium text-primary group-hover:underline">
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
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>

          {/* Analytics Card */}
          <div className="group relative overflow-hidden rounded-2xl border border-border bg-secondary p-8 opacity-60 cursor-not-allowed">
            <div className="relative z-10">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
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
              <h3 className="text-2xl font-serif font-semibold text-foreground mb-2">
                Analytics
              </h3>
              <p className="text-muted-foreground mb-4">
                Track response times, email volume, and customer satisfaction
                metrics.
              </p>
              <span className="inline-flex items-center text-sm font-medium text-muted-foreground">
                Coming Soon
              </span>
            </div>
          </div>

          {/* Settings Card */}
          <div className="group relative overflow-hidden rounded-2xl border border-border bg-secondary p-8 opacity-60 cursor-not-allowed">
            <div className="relative z-10">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
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
              <h3 className="text-2xl font-serif font-semibold text-foreground mb-2">
                Settings
              </h3>
              <p className="text-muted-foreground mb-4">
                Configure your account, manage team members, and customize
                workflows.
              </p>
              <span className="inline-flex items-center text-sm font-medium text-muted-foreground">
                Coming Soon
              </span>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="mt-16 max-w-6xl">
          <h3 className="text-2xl font-serif font-semibold text-foreground mb-6">
            Quick Overview
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-xl border border-border bg-secondary p-6">
              <div className="text-3xl font-bold text-primary mb-1">—</div>
              <div className="text-sm text-muted-foreground">
                Active Conversations
              </div>
            </div>
            <div className="rounded-xl border border-border bg-secondary p-6">
              <div className="text-3xl font-bold text-warning mb-1">—</div>
              <div className="text-sm text-muted-foreground">
                Awaiting Reply
              </div>
            </div>
            <div className="rounded-xl border border-border bg-secondary p-6">
              <div className="text-3xl font-bold text-success mb-1">—</div>
              <div className="text-sm text-muted-foreground">
                Resolved Today
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-6 text-center text-sm text-muted-foreground">
          <p>&copy; 2025 Outlight. Built for exceptional customer support.</p>
        </div>
      </footer>
    </div>
  );
}
