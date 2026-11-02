import { Linking, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/ui/Screen';
import { EnterStagger } from '@/ui/motion/EnterStagger';
import { tokens } from '@/theme/tokens';

export default function Privacy() {
  return (
    <Screen scroll style={styles.page}>
      <EnterStagger itemStyle={styles.block}>
        <Text accessibilityRole="header" style={styles.title}>Privacy policy</Text>
        <Text style={styles.body}>CodeInsta is a private, invite-only learning app run by Pranav (vjspranav.dev). This page explains what it stores.</Text>
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.heading}>What we collect</Text>
          <Text style={styles.body}>Your email address and, if you use Google sign-in, your name and profile picture from Google.</Text>
          <Text style={styles.body}>What you do in the app: reels you view and like, and invite codes you redeem.</Text>
          <Text style={styles.body}>For the owner only: notes, questions and direct messages sent to the AI creators.</Text>
        </View>
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.heading}>How it is used</Text>
          <Text style={styles.body}>Only to run the app: sign you in, keep your feed and progress, and let the AI creator accounts respond to the owner's questions. Data is never sold or used for advertising. It is stored with Supabase and served by Vercel.</Text>
        </View>
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.heading}>Deleting your data</Text>
          <Text style={styles.body}>Email <Text accessibilityRole="link" accessibilityLabel="pokemonashepisodes@gmail.com" style={styles.link} onPress={() => { void Linking.openURL('mailto:pokemonashepisodes@gmail.com').catch(() => {}); }}>pokemonashepisodes@gmail.com</Text> to have your account and all associated data deleted.</Text>
        </View>
        <Text style={styles.meta}>Last updated: 31 October 2026</Text>
      </EnterStagger>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingVertical: tokens.space[6] },
  block: { marginBottom: tokens.space[6] },
  title: { ...tokens.type.title, color: tokens.color.ink },
  heading: { ...tokens.type.heading, color: tokens.color.ink },
  body: { ...tokens.type.body, color: tokens.color.inkMuted },
  section: { gap: tokens.space[3] },
  meta: { ...tokens.type.meta, color: tokens.color.inkMuted },
  link: { color: tokens.color.ink, textDecorationLine: 'underline' },
});
