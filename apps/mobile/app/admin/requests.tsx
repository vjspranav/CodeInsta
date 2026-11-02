import { memo, useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Redirect, useFocusEffect } from 'expo-router';
import { isValidSlug } from '@shared/validation';
import type { Category } from '@shared/types';
import { useAuth } from '@/auth/useAuth';
import { useLibrary } from '@/data/library';
import { listPending, reviewRequest, slugFromLabel, SLUG_ERROR, LABEL_ERROR, REVIEW_ERROR, LOAD_REQUESTS_ERROR, type ReviewInput, type PendingReview } from '@/data/owner';
import { STATUS_LABEL, type TopicRequest } from '@/data/requests';
import { Screen } from '@/ui/Screen';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { MorphButton } from '@/ui/motion/MorphButton';
import { ShakeOnError } from '@/ui/motion/ShakeOnError';
import { EnterStagger } from '@/ui/motion/EnterStagger';
import { tokens } from '@/theme/tokens';
import { TID } from '@/testids';

const ReviewRow = memo(function ReviewRow({ item, email, categories, onDecided }: { item: TopicRequest; email?: string; categories: Category[]; onDecided: (id: string) => void }) {
  const [mode, setMode] = useState<'new_category' | 'existing' | null>(null);
  const [label, setLabel] = useState(''), [slug, setSlug] = useState(''), [existing, setExisting] = useState('');
  const [editedSlug, setEditedSlug] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const decide = async (decision: ReviewInput['decision']) => {
    if (locked.current) return;
    const chosen = (decision === 'new_category' ? slug : existing).trim();
    if (decision !== 'reject' && !isValidSlug(chosen)) { setError(SLUG_ERROR); return; }
    if (decision === 'new_category' && (!label.trim() || label.trim().length > 60)) { setError(LABEL_ERROR); return; }
    locked.current = true; setBusy(true); setError('');
    try {
      const input: ReviewInput = decision === 'reject' ? { requestId: item.id, decision } : decision === 'existing' ? { requestId: item.id, decision, slug: chosen } : { requestId: item.id, decision, slug: chosen, label: label.trim() };
      const message = await reviewRequest(input);
      if (message) setError(message); else onDecided(item.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : REVIEW_ERROR); }
    finally { locked.current = false; setBusy(false); }
  };
  return <View style={styles.card}>
    <Text style={styles.body}>{item.body}</Text>
    <Text style={styles.meta}>{email ?? item.user_id} · {new Date(item.created_at).toLocaleDateString()}</Text>
    <Button label="Approve as new category" variant="secondary" disabled={busy} onPress={() => setMode('new_category')} />
    <Button label="Approve into existing" testID={TID['review-approve-existing']} variant="secondary" disabled={busy} onPress={() => setMode('existing')} />
    <Button label="Reject" testID={TID['review-reject']} variant="ghost" disabled={busy} onPress={() => void decide('reject')} />
    {mode && <View style={styles.form}>{mode === 'new_category' ? <>
      <TextField label="Category label" maxLength={60} value={label} editable={!busy} onChangeText={value => { setLabel(value); if (!editedSlug) setSlug(slugFromLabel(value)); }} />
      <TextField label="Category slug" maxLength={40} autoCapitalize="none" autoCorrect={false} value={slug} editable={!busy} onChangeText={value => { setEditedSlug(true); setSlug(value); }} />
    </> : <><Text style={styles.meta}>Select a category</Text>{categories.map(category => <Button key={category.slug} label={category.label} variant={existing === category.slug ? 'primary' : 'secondary'} disabled={busy} onPress={() => setExisting(category.slug)} />)}</>}
      <MorphButton label="Approve request" testID={TID['review-approve']} busy={busy} onPress={() => void decide(mode)} />
    </View>}
    <ShakeOnError trigger={error}>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}</ShakeOnError>
  </View>;
});
const HistoryRow = memo(function HistoryRow({ item, email }: { item: TopicRequest; email?: string }) {
  return <View style={styles.card}><Text style={styles.body}>{item.body}</Text><Text style={styles.meta}>{email ?? item.user_id} · {new Date(item.decided_at ?? item.created_at).toLocaleDateString()}{item.category_slug ? ` · ${item.category_slug}` : ''}</Text><Text style={styles.meta}>{STATUS_LABEL[item.status]}</Text></View>;
});
const EMPTY_CATEGORIES: Category[] = [];
function OwnerRequests() {
  const { library, reload } = useLibrary();
  const [queue, setQueue] = useState<PendingReview>({ pending: [], history: [], emails: {} });
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current; setError('');
    try { const next = await listPending(); if (current === generation.current) setQueue(next); }
    catch (cause) { if (current === generation.current) setError(cause instanceof Error ? cause.message : LOAD_REQUESTS_ERROR); }
    finally { if (current === generation.current) setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); return () => { generation.current++; }; }, [load]));
  const onDecided = useCallback((id: string) => { setQueue(old => ({ ...old, pending: old.pending.filter(item => item.id !== id) })); reload(); void load(); }, [load, reload]);
  const categories = library?.categories ?? EMPTY_CATEGORIES;
  const rows = [...queue.pending, ...queue.history];
  return <Screen><KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><FlashList data={rows} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled"
    ListHeaderComponent={<EnterStagger><Text style={styles.title}>Topic requests</Text><Text style={styles.heading}>Pending review</Text>{error ? <><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Button label="Retry" onPress={() => void load()} /></> : null}{loading ? <View accessibilityLabel="Loading requests" style={styles.skeleton} /> : !queue.pending.length && !error ? <Text style={styles.meta}>Nothing waiting for review.</Text> : null}</EnterStagger>}
    renderItem={({ item, index }) => <>{index === queue.pending.length && <Text style={styles.heading}>Recently decided</Text>}{item.status === 'pending' ? <ReviewRow key={item.id} item={item} email={queue.emails[item.user_id]} categories={categories} onDecided={onDecided} /> : <HistoryRow item={item} email={queue.emails[item.user_id]} />}</>}
    ListFooterComponent={!loading && !queue.history.length ? <><Text style={styles.heading}>Recently decided</Text>{!error && <Text style={styles.meta}>No decisions yet.</Text>}</> : null}
  /></KeyboardAvoidingView></Screen>;
}
export default function Requests() {
  const { role, status } = useAuth();
  if (status === 'loading') return <Screen><View accessibilityLabel="Loading requests" style={styles.skeleton} /></Screen>;
  if (status !== 'ready' || role !== 'owner') return <Redirect href="/(tabs)" />;
  return <OwnerRequests />;
}
const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  title: { ...tokens.type.title, color: tokens.color.ink, marginVertical: tokens.space[4] },
  heading: { ...tokens.type.heading, color: tokens.color.ink, marginVertical: tokens.space[4] },
  body: { ...tokens.type.body, color: tokens.color.ink }, meta: { ...tokens.type.meta, color: tokens.color.inkMuted },
  error: { ...tokens.type.body, color: tokens.color.danger },
  card: { backgroundColor: tokens.color.panel, borderRadius: tokens.radius.md, padding: tokens.space[4], gap: tokens.space[3], marginBottom: tokens.space[4] },
  form: { gap: tokens.space[3] }, skeleton: { height: tokens.layout.controlHeight * 3, backgroundColor: tokens.color.panel, borderRadius: tokens.radius.md, marginVertical: tokens.space[4] },
});
