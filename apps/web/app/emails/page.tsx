import ConversationList from "@/components/ConversationList";
import ConversationView from "@/components/ConversationView";

export default function EmailsPage() {
  return (
    <div
      className="flex flex-1 font-sans"
      style={{ fontFamily: "var(--font-roboto), sans-serif" }}
    >
      <ConversationList />
      <ConversationView />
    </div>
  );
}
