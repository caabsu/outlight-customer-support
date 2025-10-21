import ConversationList from "@/components/ConversationList";
import ConversationView from "@/components/ConversationView";

export default function EmailsPage() {
  return (
    <div
      className="flex flex-1 font-sans"
      style={{ fontFamily: "Roboto, sans-serif" }}
    >
      <ConversationList />
      <ConversationView />
    </div>
  );
}
