import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Redirect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { Category } from '@shared/types';
import { useAuth } from '@/auth/useAuth';
import { LIBRARY_KEY, useLibrary, type Library } from '@/data/library';
import { saveInterests, SAVE_INTERESTS_ERROR } from '@/data/interests';
import { TID } from '@/testids';
import { haptic, tokens } from '@/theme/tokens';
import { Screen } from '@/ui/Screen';
import { EnterStagger } from '@/ui/motion/EnterStagger';
import { MorphButton } from '@/ui/motion/MorphButton';
import { PressableScale } from '@/ui/motion/PressableScale';
import { ShakeOnError } from '@/ui/motion/ShakeOnError';

const InterestRow = memo(function InterestRow({ item, selected, disabled, toggle }: { item: Category; selected: boolean; disabled: boolean; toggle: (slug: string) => void }) {
  return <PressableScale testID={`interest-${item.slug}`} accessibilityLabel={item.label} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} disabled={disabled} onPress={() => toggle(item.slug)} style={[styles.chip, selected && styles.selected]}>
    <Text style={styles.body}>{item.label}</Text><Text style={styles.muted}>{item.description}</Text>
  </PressableScale>;
});
const keyExtractor = (item: Category) => item.slug;
export default function Interests() {
  const { status, user } = useAuth();
  if (status === 'loading') return <Screen><View accessibilityLabel="Loading interests" style={styles.skeleton} /></Screen>;
  if (status !== 'ready' || !user) return <Redirect href="/(tabs)" />;
  return <InterestsContent key={user.id} userId={user.id} />;
}
function InterestsContent({ userId }: { userId: string }) {
  const { library, error, reload } = useLibrary();
  const client = useQueryClient();
  const [draft, setDraft] = useState(library?.areas ?? []);
  const [saved, setSaved] = useState(library?.areas ?? []);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => { if (!lock.current && library) { setDraft(library.areas); setSaved(library.areas); } }, [library?.areas]);
  const toggle = useCallback((slug: string) => { haptic('refresh'); setDraft(previous => previous.includes(slug) ? previous.filter(area => area !== slug) : [...previous, slug]); setMessage(''); }, []);
  const dirty = draft.length !== saved.length || draft.some(area => !saved.includes(area));
  const save = async () => {
    if (lock.current || !draft.length || !dirty) return;
    lock.current = true; setBusy(true); setMessage('');
    const key = [...LIBRARY_KEY, userId];
    await client.cancelQueries({ queryKey: key });
    const previous = client.getQueryData<Library>(key);
    client.setQueryData<Library>(key, old => old ? { ...old, areas: draft, onboarded: true } : old);
    try {
      const failure = await saveInterests(userId, draft);
      if (failure) { client.setQueryData(key, previous); setMessage(failure); }
      else { setSaved(draft); setMessage('Saved.'); haptic('refresh'); }
    } catch { client.setQueryData(key, previous); setMessage(SAVE_INTERESTS_ERROR); }
    finally { lock.current = false; setBusy(false); void client.invalidateQueries({ queryKey: key }); }
  };
  const renderItem = useCallback(({ item }: { item: Category }) => <InterestRow item={item} selected={draft.includes(item.slug)} disabled={busy} toggle={toggle} />, [draft, busy, toggle]);
  return <Screen><FlashList data={library?.categories ?? []} extraData={draft} renderItem={renderItem} keyExtractor={keyExtractor}
    ListHeaderComponent={<EnterStagger><View key="heading" style={styles.section}><Text accessibilityRole="header" style={styles.title}>Interests</Text><Text accessibilityRole="header" style={styles.heading}>My interests</Text><Text style={styles.muted}>Your feed leans toward these. Tap to change.</Text></View></EnterStagger>}
    ListEmptyComponent={!library && !error ? <View accessibilityLabel="Loading interests" style={styles.skeleton} /> : null}
    ListFooterComponent={<View style={styles.section}>
      {error ? <PressableScale accessibilityLabel="Retry loading interests" onPress={reload}><Text accessibilityRole="alert" style={styles.error}>{error}</Text></PressableScale> : null}
      <ShakeOnError trigger={message !== 'Saved.' ? message : ''}>{message && message !== 'Saved.' ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}</ShakeOnError>
      <MorphButton testID={TID['interests-save']} label="Save interests" busy={busy} disabled={!library || !dirty || !draft.length} onPress={() => void save()} />
      {message === 'Saved.' ? <Text accessibilityLiveRegion="polite" style={styles.muted}>Saved.</Text> : null}
      {!draft.length && library ? <Text style={styles.muted}>Pick at least one topic.</Text> : null}
    </View>} /></Screen>;
}
const styles = StyleSheet.create({
  section: { gap: tokens.space[3], paddingVertical: tokens.space[4] },
  title: { ...tokens.type.title, color: tokens.color.ink },
  heading: { ...tokens.type.body, color: tokens.color.ink, fontWeight: '600' },
  body: { ...tokens.type.body, color: tokens.color.ink },
  muted: { ...tokens.type.bodySmall, color: tokens.color.inkMuted },
  error: { ...tokens.type.bodySmall, color: tokens.color.danger },
  chip: { marginBottom: tokens.space[2], padding: tokens.space[4], gap: tokens.space[1], minHeight: tokens.layout.minTouch, borderWidth: 1, borderColor: tokens.color.line, borderRadius: tokens.radius.md, backgroundColor: tokens.color.panel },
  selected: { borderColor: tokens.color.accent, backgroundColor: tokens.color.surface },
  skeleton: { height: tokens.layout.controlHeight, marginVertical: tokens.space[3], borderRadius: tokens.radius.md, backgroundColor: tokens.color.surface },
});
