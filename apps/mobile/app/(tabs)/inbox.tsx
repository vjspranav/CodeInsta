import { MessageCircle } from "lucide-react-native";
import { tokens } from "@/theme/tokens";
import { EmptyState } from "@/ui/EmptyState";
import { Screen } from "@/ui/Screen";

// Placeholder until the Inbox task replaces this screen.
export default function Inbox() {
  return (
    <Screen bottomInset={false}>
      <EmptyState
        title="Inbox"
        body="Replies from creators will show up here."
        icon={<MessageCircle color={tokens.color.inkMuted} size={32} />}
      />
    </Screen>
  );
}
