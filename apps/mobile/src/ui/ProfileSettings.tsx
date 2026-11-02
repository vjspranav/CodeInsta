import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useAuth } from '@/auth/useAuth';
import { pendingCount } from '@/data/owner';
import { TID } from '@/testids';
import { tokens } from '@/theme/tokens';
import { Button } from './Button';
import { PressableScale } from './motion/PressableScale';

/** Profile footer order follows the web; privileged links are never shown to members. */
export function ProfileSettings() {
  const { role } = useAuth();
  const [pending, setPending] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (role === 'owner') void pendingCount().then(count => { if (active) setPending(count); });
    else setPending(0);
    return () => { active = false; };
  }, [role]));
  return <View style={{ gap: tokens.space[2], marginTop: tokens.space[6] }}>
    <Button variant="ghost" label="Interests" testID={TID['settings-interests']} onPress={() => router.push('/interests' as Href)} />
    <Button variant="ghost" label="Request a topic" testID={TID['settings-requests']} onPress={() => router.push('/requests' as Href)} />
    {role === 'owner' ? <>
      <PressableScale haptic="refresh" testID={TID['owner-requests']} accessibilityLabel={`Review requests${pending ? `, ${pending} pending` : ''}`} onPress={() => router.push('/admin/requests' as Href)}
        style={{ minHeight: tokens.layout.controlHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tokens.space[2] }}>
        <Text style={{ ...tokens.type.body, color: tokens.color.ink }}>Review requests</Text>
        {pending > 0 ? <Text testID={TID['pending-badge']} style={{ ...tokens.type.meta, color: tokens.color.accent, backgroundColor: tokens.color.panel, borderRadius: tokens.radius.pill, paddingHorizontal: tokens.space[2] }}>{pending}</Text> : null}
      </PressableScale>
      <Button variant="ghost" label="Invite friends" testID={TID['owner-invites']} onPress={() => router.push('/admin/invites' as Href)} />
    </> : null}
    <Button variant="ghost" label="Settings" onPress={() => router.push('/settings' as Href)} />
    <Button variant="ghost" label="Privacy" testID={TID['settings-privacy']} onPress={() => router.push('/privacy' as Href)} />
    <Button variant="ghost" label="About" testID={TID['settings-about']} onPress={() => router.push('/about' as Href)} />
  </View>;
}
