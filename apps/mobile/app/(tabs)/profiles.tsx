import { Users } from "lucide-react-native";
import { tokens } from "@/theme/tokens";
import { EmptyState } from "@/ui/EmptyState";
import { Screen } from "@/ui/Screen";

// Placeholder until the Profiles task replaces this screen.
export default function Profiles() {
  return (
    <Screen bottomInset={false}>
      <EmptyState
        title="Profiles"
        body="The creators behind each series will show up here."
        icon={<Users color={tokens.color.inkMuted} size={32} />}
      />
    </Screen>
  );
}
