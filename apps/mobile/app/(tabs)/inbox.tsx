import { memo, useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Redirect, router, useFocusEffect } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { ASKS_LOAD_ERROR, asksKey, fetchAsks, type Ask } from "@/data/asks";
import { fetchThreads, INBOX_POLL_MS, inboxRows, LOAD_ERROR, type InboxListRow as Row } from "@/data/inbox";
import { useLibrary } from "@/data/library";
import { haptic, tokens } from "@/theme/tokens";
import { textStyle } from "@/ui/feed/styles";
import { AskStatusRow } from "@/ui/AskStatusRow";
import { PressableScale } from "@/ui/motion/PressableScale";
import { Screen } from "@/ui/Screen";
import { InboxSkeleton, ThreadRow, threadKey } from "@/ui/ThreadRow";
import { routeForStatus } from "@/ui/shell/authRoute";

const openThread = (creatorId: string, message?: string) =>
  router.push({ pathname: "/inbox/[creator]", params: message ? { creator: creatorId, message } : { creator: creatorId } });
const openReel = (id: string) => router.push({ pathname: "/reel/[id]", params: { id } });
const openAnswer = (ask: Ask) => openThread(ask.creatorId, ask.answerMessageId ?? undefined);

export default function Inbox() {
  const auth = useAuth();
  if (auth.status === "loading")
    return (
      <Screen bottomInset={false}>
        <InboxSkeleton />
      </Screen>
    );
  if (auth.status !== "ready") return <Redirect href={`/${routeForStatus(auth.status)}` as "/login"} />;
  return <InboxContent />;
}

function InboxContent() {
  const { user, role } = useAuth();
  const userId = user!.id;
  const isOwner = role === "owner";
  const { library, loading, error, reload } = useLibrary();
  const threads = useQuery({ queryKey: threadKey(userId), queryFn: () => fetchThreads(userId), refetchInterval: INBOX_POLL_MS });
  const asks = useQuery({ queryKey: asksKey(userId), queryFn: () => fetchAsks(userId), refetchInterval: INBOX_POLL_MS });
  const { refetch: refetchThreads } = threads;
  const { refetch: refetchAsks } = asks;
  // A question sent from the feed shows up as soon as the tab is opened.
  useFocusEffect(
    useCallback(() => {
      void refetchAsks();
    }, [refetchAsks]),
  );
  const refresh = useCallback(() => {
    haptic("refresh");
    reload();
    void refetchThreads();
    void refetchAsks();
  }, [reload, refetchThreads, refetchAsks]);

  const rows = useMemo(() => inboxRows(library?.creators ?? [], threads.data, asks.data), [library?.creators, threads.data, asks.data]);
  const renderItem = useCallback(({ item }: { item: Row }) => <InboxRow item={item} isOwner={isOwner} />, [isOwner]);
  const failure = error || threads.isError ? LOAD_ERROR : asks.isError ? ASKS_LOAD_ERROR : "";

  return (
    <Screen bottomInset={false}>
      <Text accessibilityRole="header" style={styles.heading}>
        Inbox
      </Text>
      <Text style={styles.intro}>
        {isOwner ? "Ask a question. Build on what you learned." : "Answers to your questions show up here. Tap Ask on any reel."}
      </Text>
      {failure ? (
        <PressableScale accessibilityLabel="Retry" onPress={refresh} style={styles.retry}>
          <Text accessibilityRole="alert" style={styles.error}>
            {failure}
          </Text>
          <Text style={styles.retryText}>Retry</Text>
        </PressableScale>
      ) : null}
      {loading || threads.isPending ? (
        <InboxSkeleton />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={keyOf}
          getItemType={typeOf}
          renderItem={renderItem}
          onRefresh={refresh}
          refreshing={false}
          contentContainerStyle={styles.list}
        />
      )}
    </Screen>
  );
}

const keyOf = (row: Row) => row.key;
const typeOf = (row: Row) => row.type;

const InboxRow = memo(function InboxRow({ item, isOwner }: { item: Row; isOwner: boolean }) {
  if (item.type === "thread")
    return <ThreadRow creator={item.creator} thread={item.thread} isOwner={isOwner} waiting={item.waiting} onPress={openThread} />;
  if (item.type === "ask")
    return (
      <View style={styles.ask}>
        <AskStatusRow ask={item.ask} creatorName={item.creatorName} onOpenReel={openReel} onOpenAnswer={openAnswer} compact />
      </View>
    );
  return (
    <PressableScale
      testID={`inbox-more-${item.creator.id}`}
      accessibilityRole="link"
      accessibilityLabel={`See all ${item.count} questions to ${item.creator.display_name}`}
      onPress={() => openThread(item.creator.id)}
      style={styles.more}
    >
      <Text style={styles.moreText}>{`See all ${item.count} questions`}</Text>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  heading: { ...textStyle("title"), color: tokens.color.ink, paddingTop: tokens.space[5], paddingBottom: tokens.space[2] },
  intro: { ...textStyle("bodySmall"), color: tokens.color.inkMuted, paddingBottom: tokens.space[2] },
  retry: { paddingVertical: tokens.space[2], gap: tokens.space[1] },
  error: { ...textStyle("bodySmall"), color: tokens.color.danger },
  retryText: { ...textStyle("bodySmall"), color: tokens.color.accent },
  list: { paddingBottom: tokens.space[6] },
  ask: { paddingLeft: tokens.layout.headerHeight + tokens.space[4], paddingBottom: tokens.space[2] },
  more: { paddingLeft: tokens.layout.headerHeight + tokens.space[4], minHeight: tokens.layout.minTouch, justifyContent: "center" },
  moreText: { ...textStyle("bodySmall"), color: tokens.color.accent },
});
