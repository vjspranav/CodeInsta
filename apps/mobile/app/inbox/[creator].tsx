import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react-native";

import { useAuth } from "@/auth/useAuth";
import { ASKS_LOAD_ERROR, asksKey, fetchAsks } from "@/data/asks";
import {
  fetchThreads,
  INBOX_POLL_MS,
  LOAD_ERROR,
  markThreadRead,
  sendMessage,
  SEND_ERROR,
  threadTimeline,
  UNREAD_KEY,
  type Message,
  type Thread,
  type ThreadItem,
} from "@/data/inbox";
import { useLibrary } from "@/data/library";
import { tokens } from "@/theme/tokens";
import { textStyle } from "@/ui/feed/styles";
import { AskStatusRow } from "@/ui/AskStatusRow";
import { Composer } from "@/ui/Composer";
import { CreatorAvatar } from "@/ui/CreatorAvatar";
import { EmptyState } from "@/ui/EmptyState";
import { MessageBubble } from "@/ui/MessageBubble";
import { PressableScale } from "@/ui/motion/PressableScale";
import { Screen } from "@/ui/Screen";
import { routeForStatus } from "@/ui/shell/authRoute";
import { InboxSkeleton, threadKey } from "@/ui/ThreadRow";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const openReel = (id: string) => router.push({ pathname: "/reel/[id]", params: { id } });

export default function ThreadScreen() {
  const auth = useAuth();
  const params = useLocalSearchParams<{ creator: string; message?: string }>();
  const creatorId = first(params.creator) ?? "";
  if (auth.status === "loading")
    return (
      <Screen>
        <InboxSkeleton />
      </Screen>
    );
  if (auth.status !== "ready") return <Redirect href={`/${routeForStatus(auth.status)}` as "/login"} />;
  return <ThreadContent key={`${auth.user?.id}:${creatorId}`} creatorId={creatorId} focusMessage={first(params.message)} />;
}

function ThreadContent({ creatorId, focusMessage }: { creatorId: string; focusMessage?: string }) {
  const { user, role } = useAuth();
  const userId = user!.id;
  const isOwner = role === "owner";
  const { library, loading, error: libraryError, reload } = useLibrary();
  const client = useQueryClient();
  const key = useMemo(() => threadKey(userId), [userId]);
  const query = useQuery({ queryKey: key, queryFn: () => fetchThreads(userId), refetchInterval: INBOX_POLL_MS });
  const asks = useQuery({ queryKey: asksKey(userId), queryFn: () => fetchAsks(userId), refetchInterval: INBOX_POLL_MS });
  const creator = library?.creators.find((c) => c.id === creatorId);
  const name = creator?.display_name ?? "Inbox";

  const thread = query.data?.find((t) => t.creatorId === creatorId);
  const messages = useMemo(() => thread?.messages ?? [], [thread]);

  // Mark each batch of unread creator messages read once: on open, and again only when new ones arrive.
  const marked = useRef(new Set<string>());
  useEffect(() => {
    if (!creator) return;
    const fresh = messages.filter((m) => m.sender === "creator" && !m.read_at && !marked.current.has(m.id));
    if (!fresh.length) return;
    for (const m of fresh) marked.current.add(m.id);
    void client.cancelQueries({ queryKey: key });
    void client.cancelQueries({ queryKey: UNREAD_KEY });
    const readAt = new Date().toISOString();
    client.setQueryData<Thread[]>(key, (old) =>
      old?.map((t) =>
        t.creatorId === creatorId
          ? { ...t, unread: 0, messages: t.messages.map((m) => (m.sender === "creator" && !m.read_at ? { ...m, read_at: readAt } : m)) }
          : t,
      ),
    );
    client.setQueryData<number>(UNREAD_KEY, (old) => Math.max(0, (old ?? fresh.length) - fresh.length));
    void markThreadRead(userId, creatorId);
  }, [creator, messages, client, key, creatorId, userId]);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [optimistic, setOptimistic] = useState<Message | null>(null);
  const sending = useRef(false);
  const baseline = useRef(new Set<string>());

  const send = useCallback(async () => {
    if (sending.current || !draft.trim() || !isOwner) return;
    sending.current = true;
    setBusy(true);
    setError("");
    const message: Message = {
      id: `pending-${Date.now()}`,
      user_id: userId,
      creator_id: creatorId,
      sender: "user",
      body_md: draft.trim(),
      created_at: new Date().toISOString(),
      read_at: null,
    };
    baseline.current = new Set(messages.map((m) => m.id));
    setOptimistic(message);
    try {
      const failure = await sendMessage(userId, creatorId, draft);
      if (failure) {
        setError(failure);
        return;
      }
      setDraft("");
      const refreshed = await query.refetch();
      if (refreshed.isError) {
        client.setQueryData<Thread[]>(key, (old) => {
          const existing = old?.find((t) => t.creatorId === creatorId);
          const next: Thread = {
            creatorId,
            lastBody: message.body_md,
            lastAt: message.created_at,
            unread: 0,
            messages: [...(existing?.messages ?? []), message],
          };
          return [...(old ?? []).filter((t) => t.creatorId !== creatorId), next];
        });
      }
    } catch {
      setError(SEND_ERROR);
    } finally {
      setOptimistic(null);
      setBusy(false);
      sending.current = false;
    }
  }, [client, creatorId, draft, isOwner, key, messages, query, userId]);

  // The optimistic row stays until the server list has the real one; never show both.
  const shown = useMemo(() => {
    if (!optimistic) return messages;
    const landed = messages.some((m) => !baseline.current.has(m.id) && m.sender === "user" && m.body_md === optimistic.body_md);
    return landed ? messages : [...messages, optimistic];
  }, [messages, optimistic]);
  const items = useMemo(() => threadTimeline(shown, asks.data ?? [], creatorId), [shown, asks.data, creatorId]);
  const focusIndex = focusMessage ? items.findIndex((i) => i.key === `m:${focusMessage}`) : -1;

  const renderItem = useCallback(
    ({ item }: { item: ThreadItem }) =>
      item.kind === "message" ? (
        <MessageBubble message={item.message} />
      ) : (
        <View style={styles.ask}>
          <AskStatusRow ask={item.ask} creatorName={name} onOpenReel={openReel} />
        </View>
      ),
    [name],
  );

  const retry = useCallback(() => {
    reload();
    void query.refetch();
    void asks.refetch();
  }, [asks, query, reload]);

  if (loading || query.isPending)
    return (
      <Screen>
        <InboxSkeleton />
      </Screen>
    );
  if (!creator && !libraryError)
    return (
      <Screen>
        <EmptyState title="Creator not found" />
      </Screen>
    );
  const failure = query.isError || libraryError ? LOAD_ERROR : asks.isError ? ASKS_LOAD_ERROR : "";

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.header}>
          <PressableScale accessibilityLabel="Back to threads" onPress={() => router.back()} style={styles.back}>
            <ArrowLeft size={tokens.space[6]} color={tokens.color.ink} />
          </PressableScale>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
            {name}
          </Text>
          {creator ? <CreatorAvatar creatorId={creator.id} size={tokens.space[7]} /> : null}
        </View>
        {failure ? (
          <PressableScale accessibilityLabel="Retry" onPress={retry} style={styles.retry}>
            <Text accessibilityRole="alert" style={styles.error}>
              {failure}
            </Text>
            <Text style={styles.retryText}>Retry</Text>
          </PressableScale>
        ) : null}
        <FlashList
          data={items}
          keyExtractor={keyOf}
          getItemType={typeOf}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          initialScrollIndex={focusIndex >= 0 ? focusIndex : undefined}
          maintainVisibleContentPosition={
            focusIndex >= 0 ? undefined : { startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 }
          }
          ListEmptyComponent={
            <EmptyState
              title={isOwner ? "What are you working through?" : `No answers from ${name} yet.`}
              body={isOwner ? `Send ${name} your first question.` : "Tap Ask on a reel; answers usually arrive within the hour."}
            />
          }
        />
        {isOwner && creator ? (
          <Composer name={creator.display_name} value={draft} onChange={setDraft} onSend={() => void send()} busy={busy} error={error} />
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const keyOf = (item: ThreadItem) => item.key;
const typeOf = (item: ThreadItem) => item.kind;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: tokens.space[3], paddingVertical: tokens.space[3] },
  back: { minWidth: tokens.layout.minTouch, minHeight: tokens.layout.minTouch, justifyContent: "center" },
  title: { ...textStyle("heading"), color: tokens.color.ink, flex: 1 },
  retry: { paddingVertical: tokens.space[2], gap: tokens.space[1] },
  error: { ...textStyle("bodySmall"), color: tokens.color.danger },
  retryText: { ...textStyle("bodySmall"), color: tokens.color.accent },
  ask: { paddingLeft: tokens.space[7], paddingVertical: tokens.space[2] },
});
