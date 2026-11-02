import { useCallback, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Redirect, useFocusEffect } from 'expo-router';
import { useAuth } from '@/auth/useAuth';
import { registerPush, unregisterPush } from '@/push/register';
import { secureStorage } from '@/lib/secure-storage';
import { tokens, haptic } from '@/theme/tokens';
import { TID } from '@/testids';
import { Screen } from '@/ui/Screen';
import { Button } from '@/ui/Button';
import { SectionHeader } from '@/ui/SectionHeader';
import { ShakeOnError } from '@/ui/motion/ShakeOnError';
import { EnterStagger } from '@/ui/motion/EnterStagger';

export default function Settings() {
  const { status } = useAuth();
  if (status === 'loading') return <Screen><View accessibilityLabel="Loading settings" accessibilityState={{ busy: true }} style={{ height: tokens.layout.controlHeight, marginVertical: tokens.space[6], borderRadius: tokens.radius.md, backgroundColor: tokens.color.panel }} /></Screen>;
  if (status !== 'ready') return <Redirect href="/(tabs)" />;
  return <SettingsContent />;
}
function SettingsContent() {
  const { user, signOut } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    setBusy(true);
    void secureStorage.getItem('codeinsta.push.token').then(token => {
      if (active) setEnabled(Boolean(token));
    }).catch(() => { if (active) setEnabled(false); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []));
  const toggle = async (next: boolean) => {
    if (busy || !user) return;
    haptic('refresh');
    setBusy(true);
    setMessage('');
    setEnabled(next);
    try {
      if (next) {
        const result = await registerPush(user.id);
        if (result !== 'registered') {
          setEnabled(false);
          setMessage(result === 'denied' ? 'Notifications are disabled in your device settings.' : 'Notifications are not available on this device.');
        }
      } else await unregisterPush(user.id);
    } catch {
      setEnabled(!next);
      setMessage('Could not update notifications. Try again.');
    } finally { setBusy(false); }
  };
  return <Screen scroll>
    <EnterStagger><SectionHeader title="Settings" /></EnterStagger>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: tokens.space[4] }}>
      <Text style={{ ...tokens.type.body, color: tokens.color.ink }}>Notifications</Text>
      <Switch testID={TID['settings-notifications']} accessibilityLabel="Notifications" accessibilityState={{ busy }} value={enabled} disabled={busy} onValueChange={value => void toggle(value)} trackColor={{ true: tokens.color.accent, false: tokens.color.line }} />
    </View>
    <ShakeOnError trigger={message}>{message ? <Text accessibilityRole="alert" style={{ ...tokens.type.bodySmall, color: tokens.color.inkMuted }}>{message}</Text> : null}</ShakeOnError>
    <Text style={{ ...tokens.type.meta, color: tokens.color.inkMuted, marginVertical: tokens.space[6] }}>Version {Constants.expoConfig?.version ?? 'Unknown'}</Text>
    <Button variant="ghost" label="Sign out" testID={TID['settings-signout']} busy={signingOut} onPress={() => {
      setSigningOut(true);
      void signOut().catch(() => setMessage('Could not sign out. Try again.')).finally(() => setSigningOut(false));
    }} />
  </Screen>;
}
