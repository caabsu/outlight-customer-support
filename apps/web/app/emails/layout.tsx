"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import { ConversationProvider } from "@/lib/ConversationContext";

export default function EmailsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(256); // 256px = 16rem = w-64

  const handleLeftResize = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftSidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(200, Math.min(500, startWidth + delta)); // Min 200px, Max 500px
      setLeftSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <ConversationProvider>
      <div
        className="flex h-screen overflow-hidden bg-background font-sans"
        style={{ fontFamily: "Roboto, sans-serif" }}
      >
        <div style={{ width: `${leftSidebarWidth}px` }} className="shrink-0">
          <Sidebar />
        </div>

        {/* Left Resize Handle */}
        <div
          onMouseDown={handleLeftResize}
          className="w-1 hover:w-2 bg-border hover:bg-primary cursor-col-resize shrink-0 transition-all group relative"
        >
          <div className="absolute inset-y-0 -left-1 -right-1"></div>
        </div>

        {children}
      </div>
    </ConversationProvider>
  );
}
