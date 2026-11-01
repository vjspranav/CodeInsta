import { Compass } from "lucide-react-native";
import { tokens } from "@/theme/tokens";
import { EmptyState } from "@/ui/EmptyState";
import { Screen } from "@/ui/Screen";

// Placeholder until the Explore task replaces this screen.
export default function Explore() {
  return (
    <Screen bottomInset={false}>
      <EmptyState
        title="Explore"
        body="Topics and series will show up here."
        icon={<Compass color={tokens.color.inkMuted} size={32} />}
      />
    </Screen>
  );
}
