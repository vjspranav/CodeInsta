import { memo, useCallback } from "react";
import { Share } from "react-native";
import { Share2 } from "lucide-react-native";
import type { MobileReel } from "@shared/types";

import { TID } from "@/testids";
import { tokens } from "@/theme/tokens";
import { RAIL_ICON_SIZE, RailButton } from "@/ui/feed/RailButton";

export const SITE_URL = "https://codeinsta.vjspranav.dev";

/** The message shared from a reel: its title and the public web link. */
export function shareMessage(reel: Pick<MobileReel, "id" | "title">): string {
  return `${reel.title} ${SITE_URL}/reel/${reel.id}`;
}

/** Opens the system share sheet. A dismissed or failed sheet is not an error worth showing. */
export async function shareReel(reel: Pick<MobileReel, "id" | "title">): Promise<void> {
  try {
    await Share.share({ message: shareMessage(reel) });
  } catch {
    // The system sheet failed to open: nothing to roll back, the user can tap again.
  }
}

/** Rail button that shares the reel through the system share sheet. */
function ShareActionImpl({ reel }: { reel: Pick<MobileReel, "id" | "title"> }) {
  const onPress = useCallback(() => void shareReel(reel), [reel]);
  return (
    <RailButton testID={TID["reel-share"]} label="Share" accessibilityLabel="Share this reel" onPress={onPress}>
      <Share2 size={RAIL_ICON_SIZE} color={tokens.color.text} strokeWidth={2} />
    </RailButton>
  );
}

export const ShareAction = memo(ShareActionImpl);
