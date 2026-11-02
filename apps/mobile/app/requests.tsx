import { memo, useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/auth/useAuth';
import { useLibrary } from '@/data/library';
import { myRequests, REQUEST_ERROR, REQUEST_MAX, REQUEST_MIN, STATUS_LABEL, submitRequest, type TopicRequest } from '@/data/requests';
import { markMeaningfulAction } from '@/push/register';
import { TID } from '@/testids';
import { haptic, tokens } from '@/theme/tokens';
import { Screen } from '@/ui/Screen';
import { TextField } from '@/ui/TextField';
import { EnterStagger } from '@/ui/motion/EnterStagger';
import { MorphButton } from '@/ui/motion/MorphButton';
import { PressableScale } from '@/ui/motion/PressableScale';
import { ShakeOnError } from '@/ui/motion/ShakeOnError';

const RequestRow = memo(function RequestRow({ item }: { item: TopicRequest }) {
  return <View style={styles.row}>
    <Text style={styles.body}>{item.body}</Text>
    <Text style={styles.muted}>{STATUS_LABEL[item.status]}</Text>
    {item.status === 'done' && item.fulfilled_reel_id && <PressableScale testID={`request-reel-${item.id}`} accessibilityLabel="Watch the reel" onPress={() => router.push({ pathname: '/reel/[id]', params: { id: item.fulfilled_reel_id! } })} style={styles.link}>
      <Text style={styles.linkText}>Watch the reel →</Text>
    </PressableScale>}
  </View>;
});
const renderRequest = ({ item }: { item: TopicRequest }) => <RequestRow item={item} />;
const keyExtractor = (item: TopicRequest) => item.id;

export default function Requests() {
  const { status, user, role } = useAuth();
  if (status === 'loading') return <Screen><View accessibilityLabel="Loading requests" style={styles.skeleton} /></Screen>;
  if (status !== 'ready' || !user) return <Redirect href="/(tabs)" />;
  return <RequestContent key={user.id} userId={user.id} owner={role === 'owner'} />;
}

function RequestContent({ userId, owner }: { userId: string; owner: boolean }) {
  const { library, error: libraryError, reload } = useLibrary();
  const [items, setItems] = useState<TopicRequest[]>([]);
  const [body, setBody] = useState('');
  const [area, setArea] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    if (lock.current) return;
    const ticket = ++generation.current;
    try {
      const next = await myRequests(userId);
      if (ticket === generation.current) { setItems(next); setError(''); }
    } catch { if (ticket === generation.current) setError('Could not load your requests. Try again.'); }
    finally { if (ticket === generation.current) setLoading(false); }
  }, [userId]);
  useFocusEffect(useCallback(() => { void load(); return () => { generation.current++; }; }, [load]));
  const send = async () => {
    const text = body.trim();
    if (lock.current || text.length < REQUEST_MIN || text.length > REQUEST_MAX) return;
    lock.current = true; setBusy(true); setError('');
    const optimisticId = `pending-${Date.now()}`;
    generation.current++;
    setItems(previous => [{ id: optimisticId, user_id: userId, body: text, area: area || null, status: owner ? 'approved' : 'pending', created_at: new Date().toISOString(), fulfilled_reel_id: null }, ...previous]);
    let failure = '';
    try { failure = await submitRequest(userId, area, text); } catch { failure = REQUEST_ERROR; }
    if (failure) { setItems(previous => previous.filter(item => item.id !== optimisticId)); setError(failure); }
    else { setBody(''); haptic('refresh'); markMeaningfulAction(); }
    lock.current = false; setBusy(false); setLoading(false);
    if (!failure) void load();
  };
  const header = <EnterStagger>
    <View key="heading" style={styles.section}>
      <Text accessibilityRole="header" style={styles.title}>Topic requests</Text>
      <Text style={styles.muted}>Ask for something you want to learn. The owner reviews every request.</Text>
    </View>
    <View key="form" style={styles.section}>
      <View testID={TID['request-area']} accessibilityLabel="Area" style={styles.areas}>
        <PressableScale testID="request-area-any" accessibilityLabel="Any topic" accessibilityRole="radio" accessibilityState={{ selected: !area }} onPress={() => setArea('')} style={[styles.chip, !area && styles.selected]}><Text style={styles.body}>Any topic</Text></PressableScale>
        {library?.categories.map(category => <PressableScale key={category.slug} testID={`request-area-${category.slug}`} accessibilityRole="radio" accessibilityLabel={category.label} accessibilityState={{ selected: area === category.slug }} onPress={() => setArea(category.slug)} style={[styles.chip, area === category.slug && styles.selected]}><Text style={styles.body}>{category.label}</Text></PressableScale>)}
      </View>
      {libraryError ? <PressableScale accessibilityLabel="Retry loading topics" onPress={reload} style={styles.link}><Text style={styles.error}>{libraryError}</Text></PressableScale> : null}
      <TextField testID={TID['request-input']} label="Topic request" value={body} onChangeText={setBody} maxLength={REQUEST_MAX} placeholder="e.g. How does ART compile apps?" editable={!busy} />
      <MorphButton testID={TID['request-send']} label="Request" busy={busy} disabled={body.trim().length < REQUEST_MIN} onPress={() => void send()} />
      <ShakeOnError trigger={error}>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}</ShakeOnError>
    </View>
  </EnterStagger>;
  return <Screen><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <FlashList data={items} keyExtractor={keyExtractor} renderItem={renderRequest} keyboardShouldPersistTaps="handled" ListHeaderComponent={header} ListEmptyComponent={loading ? <View accessibilityLabel="Loading requests" style={styles.skeleton} /> : <Text style={styles.muted}>No requests yet.</Text>} ListFooterComponent={<PressableScale accessibilityLabel="Refresh requests" disabled={busy} onPress={() => { haptic('refresh'); void load(); }} style={styles.link}><Text style={styles.linkText}>Refresh</Text></PressableScale>} />
  </KeyboardAvoidingView></Screen>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: tokens.space[3], paddingVertical: tokens.space[4] },
  title: { ...tokens.type.title, color: tokens.color.ink },
  body: { ...tokens.type.body, color: tokens.color.ink },
  muted: { ...tokens.type.bodySmall, color: tokens.color.inkMuted },
  error: { ...tokens.type.bodySmall, color: tokens.color.danger },
  areas: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space[2] },
  chip: { padding: tokens.space[3], minHeight: tokens.layout.minTouch, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: tokens.color.line, backgroundColor: tokens.color.panel },
  selected: { borderColor: tokens.color.accent, backgroundColor: tokens.color.surface },
  row: { paddingVertical: tokens.space[4], borderBottomWidth: 1, borderBottomColor: tokens.color.line, gap: tokens.space[2] },
  link: { minHeight: tokens.layout.minTouch, justifyContent: 'center' },
  linkText: { ...tokens.type.bodySmall, color: tokens.color.accent },
  skeleton: { height: tokens.layout.controlHeight, marginVertical: tokens.space[3], borderRadius: tokens.radius.md, backgroundColor: tokens.color.surface },
});
