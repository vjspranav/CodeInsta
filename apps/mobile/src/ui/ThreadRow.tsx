import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Creator } from "@shared/types";

import type { Thread } from "@/data/inbox";
import { inboxThreadId } from "@/testids";
import { tokens } from "@/theme/tokens";
import { textStyle } from "@/ui/feed/styles";
import { CreatorAvatar } from "./CreatorAvatar";
import { PressableScale } from "./motion/PressableScale";

const AVATAR = tokens.layout.headerHeight;

export const threadKey = (userId: string) => ["inbox", "threads", userId] as const;

export type ThreadRowProps = {
  creator: Creator;
  thread?: Thread;
  isOwner: boolean;
  /** Questions to this creator still waiting for an answer. */
  waiting?: number;
  onPress(creatorId: string): void;
};

/** Web copy: the last message, else what is pending, else the empty hint. */
export function threadPreview(thread: Thread | undefined, creatorName: string, isOwner: boolean, waiting: number): string {
  if (thread?.lastBody) return thread.lastBody.slice(0, 80);
  if (waiting > 0) return waiting === 1 ? `1 question waiting for ${creatorName}` : `${waiting} questions waiting for ${creatorName}`;
  return isOwner ? "Start a conversation" : "No answers yet";
}

/** A creator thread in the Inbox list: logo, name, preview, unread dot. */
export const ThreadRow = memo(function ThreadRow({ creator, thread, isOwner, waiting = 0, onPress }: ThreadRowProps) {
  const unread = thread?.unread ?? 0;
  return (
    <PressableScale
      testID={inboxThreadId(creator.id)}
      accessibilityLabel={unread ? `${creator.display_name}, ${unread} unread` : creator.display_name}
      onPress={() => onPress(creator.id)}
      style={styles.row}
    >
      <CreatorAvatar creatorId={creator.id} size={AVATAR} />
      <View style={styles.copy}>
        <Text style={styles.title}>{creator.display_name}</Text>
        <Text numberOfLines={1} style={[styles.preview, unread > 0 && styles.previewUnread]}>
          {threadPreview(thread, creator.display_name, isOwner, waiting)}
        </Text>
      </View>
      {unread > 0 ? <View accessibilityLabel={`${unread} unread messages`} style={styles.dot} /> : null}
    </PressableScale>
  );
});

/** Skeleton rows while the inbox loads (no spinner). */
export function InboxSkeleton() {
  return (
    <View accessibilityLabel="Loading inbox" style={styles.skeleton}>
      {[0, 1, 2].map((n) => (
        <View key={n} style={styles.row}>
          <View style={styles.skeletonAvatar} />
          <View style={styles.copy}>
            <View style={[styles.bar, styles.barShort]} />
            <View style={styles.bar} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space[4], paddingVertical: tokens.space[4] },
  copy: { flex: 1, minWidth: 0, gap: tokens.space[1] },
  title: { ...textStyle("heading"), color: tokens.color.ink },
  preview: { ...textStyle("bodySmall"), color: tokens.color.inkMuted },
  previewUnread: { color: tokens.color.ink },
  dot: { width: tokens.space[3], height: tokens.space[3], borderRadius: tokens.radius.pill, backgroundColor: tokens.color.accent },
  skeleton: { paddingTop: tokens.space[2] },
  skeletonAvatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: tokens.color.surface },
  bar: { height: tokens.space[3], borderRadius: tokens.radius.xs, backgroundColor: tokens.color.surface },
  barShort: { width: "40%" },
});
