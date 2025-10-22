import ConversationList from "@/components/ConversationList";
import ConversationView from "@/components/ConversationView";

export default function EmailsPage() {
  return (
    <div
      className="flex flex-1 font-sans overflow-hidden min-w-0"
      style={{ fontFamily: "Roboto, sans-serif" }}
    >
      <ConversationList />
      <ConversationView />
    </div>
  );
}
