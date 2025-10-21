import ConversationList from "@/components/ConversationList";
import ConversationView from "@/components/ConversationView";
import Sidebar from "@/components/Sidebar";
import { ConversationProvider } from "@/lib/ConversationContext";

export default function Home() {
  return (
    <ConversationProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Sidebar */}
        <Sidebar />

        {/* Conversation List */}
        <ConversationList />

        {/* Conversation View */}
        <ConversationView />
      </div>
    </ConversationProvider>
  );
}
