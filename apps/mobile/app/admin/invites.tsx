import { memo, useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Redirect, useFocusEffect } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '@/auth/useAuth';
import { createInvite, listInvites, INVITE_CREATE_ERROR, INVITE_LIST_ERROR, type Invite } from '@/data/owner';
import { Screen } from '@/ui/Screen';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { MorphButton } from '@/ui/motion/MorphButton';
import { ShakeOnError } from '@/ui/motion/ShakeOnError';
import { EnterStagger } from '@/ui/motion/EnterStagger';
import { tokens } from '@/theme/tokens';
import { TID } from '@/testids';
const InviteRow = memo(function InviteRow({ item, onCopy }: { item: Invite; onCopy: (code: string) => void }) {
  return <View style={styles.card}><Text selectable style={styles.code}>{item.code}</Text><Text style={styles.meta}>{item.uses} / {item.max_uses} uses{item.expires_at ? ` · Expires ${new Date(item.expires_at).toISOString().slice(0, 10)}` : ' · No expiry'}</Text>{item.note ? <Text style={styles.meta}>{item.note}</Text> : null}<Button label="Copy code" testID={TID['invite-copy']} variant="secondary" onPress={() => onCopy(item.code)} /></View>;
});
function OwnerInvites() {
  const [items, setItems] = useState<Invite[]>([]), [loading, setLoading] = useState(true);
  const [uses, setUses] = useState('1'), [days, setDays] = useState(''), [note, setNote] = useState('');
  const [error, setError] = useState(''), [loadError, setLoadError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const locked = useRef(false), generation = useRef(0);
  const load = useCallback(async () => {
    if (locked.current) return;
    const current = ++generation.current; setLoadError(''); setLoading(true);
    try { const next = await listInvites(); if (current === generation.current) setItems(next); }
    catch { if (current === generation.current) setLoadError(INVITE_LIST_ERROR); }
    finally { if (current === generation.current) setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); return () => { generation.current++; }; }, [load]));
  const create = async () => {
    if (locked.current || loading) return;
    generation.current++;
    locked.current = true; setBusy(true); setError('');
    try {
      const input = { uses: Number(uses), days: days.trim() ? Number(days) : undefined, note: note.trim() };
      const code = await createInvite(input);
      setItems(old => [{ code, uses: 0, max_uses: input.uses, expires_at: input.days === undefined ? null : new Date(Date.now() + input.days * 86400000).toISOString(), note: input.note }, ...old]);
      setNote(''); setMessage('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : INVITE_CREATE_ERROR); }
    finally { locked.current = false; setBusy(false); }
  };
  const copy = useCallback(async (code: string) => {
    try { const copied = await Clipboard.setStringAsync(code); setMessage(copied ? 'Code copied.' : 'Could not copy. Select the code to copy it manually.'); }
    catch { setMessage('Could not copy. Select the code to copy it manually.'); }
  }, []);
  return <Screen><KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><FlashList data={items} keyExtractor={item => item.code} keyboardShouldPersistTaps="handled"
    ListHeaderComponent={<View style={styles.form}><EnterStagger><Text style={styles.title}>Invite friends</Text></EnterStagger><TextField label="Number of uses" keyboardType="number-pad" value={uses} onChangeText={setUses} editable={!busy} /><TextField label="Expires in days" keyboardType="number-pad" value={days} onChangeText={setDays} editable={!busy} hint="Leave blank for no expiry" /><TextField label="Note" value={note} onChangeText={setNote} editable={!busy} /><MorphButton label="Create invite" busy={busy} disabled={loading} testID={TID['invite-create']} onPress={() => void create()} /><ShakeOnError trigger={error}>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}</ShakeOnError>{message ? <Text accessibilityLiveRegion="polite" style={styles.meta}>{message}</Text> : null}{loadError ? <><Text accessibilityRole="alert" style={styles.error}>{loadError}</Text><Button label="Retry" onPress={() => void load()} /></> : null}</View>}
    renderItem={({ item }) => <InviteRow item={item} onCopy={copy} />}
    ListEmptyComponent={loading ? <View accessibilityLabel="Loading invites" style={styles.skeleton} /> : !loadError ? <Text style={styles.meta}>No invites yet.</Text> : null}
  /></KeyboardAvoidingView></Screen>;
}
export default function Invites() {
  const { role, status } = useAuth();
  if (status === 'loading') return <Screen><View accessibilityLabel="Loading invites" style={styles.skeleton} /></Screen>;
  if (status !== 'ready' || role !== 'owner') return <Redirect href="/(tabs)" />;
  return <OwnerInvites />;
}
const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  title: { ...tokens.type.title, color: tokens.color.ink, marginVertical: tokens.space[4] },
  code: { ...tokens.type.mono, color: tokens.color.ink }, meta: { ...tokens.type.meta, color: tokens.color.inkMuted }, error: { ...tokens.type.body, color: tokens.color.danger },
  form: { gap: tokens.space[3], marginBottom: tokens.space[4] },
  card: { backgroundColor: tokens.color.panel, borderRadius: tokens.radius.md, padding: tokens.space[4], gap: tokens.space[3], marginBottom: tokens.space[4] },
  skeleton: { height: tokens.layout.controlHeight * 3, backgroundColor: tokens.color.panel, borderRadius: tokens.radius.md, marginVertical: tokens.space[4] },
});
