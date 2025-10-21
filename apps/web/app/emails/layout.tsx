"use client";

import Sidebar from "@/components/Sidebar";
import { ConversationProvider } from "@/lib/ConversationContext";

export default function EmailsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConversationProvider>
      <div
        className="flex h-screen overflow-hidden bg-background font-sans"
        style={{ fontFamily: "Roboto, sans-serif" }}
      >
        <Sidebar />
        {children}
      </div>
    </ConversationProvider>
  );
}
