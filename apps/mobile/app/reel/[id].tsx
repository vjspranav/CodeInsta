import { useLocalSearchParams } from "expo-router";

import { FeedScreen } from "@/ui/feed/FeedScreen";

/** Deep link `codeinsta://reel/<id>`: the same feed, led by that reel (and its unseen earlier parts). */
export default function ReelRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FeedScreen entryReelId={typeof id === "string" ? id : undefined} />;
}
