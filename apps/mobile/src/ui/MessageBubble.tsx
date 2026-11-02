import { memo } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import type { Message } from '@/data/inbox';
import { tokens } from '@/theme/tokens';
import { shortTime } from '@/data/inbox';
import { textStyle } from '@/ui/feed/styles';

// Native text keeps authored content selectable. Render common Markdown inline marks without HTML.
function inline(text: string) {
 return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g).map((part, index) => {
  const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
  if (link) return <Text key={index} accessibilityRole="link" style={styles.link} onPress={() => { void Linking.openURL(link[2]).catch(() => {}); }}>{link[1]}</Text>;
  if (part.startsWith('**') && part.endsWith('**')) return <Text key={index} style={styles.bold}>{part.slice(2, -2)}</Text>;
  if (part.startsWith('`') && part.endsWith('`')) return <Text key={index} style={styles.code}>{part.slice(1, -1)}</Text>;
  return part;
 });
}
export const MessageBubble = memo(function MessageBubble({ message }: { message: Message }) {
 return <View style={[styles.bubble, message.sender === 'user' ? styles.user : styles.creator]}>
  {message.body_md.split(/(```[\s\S]*?```)/g).map((part, index) => part.startsWith('```') ? <Text selectable key={index} style={[styles.body, styles.code]}>{part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '')}</Text> : <Text selectable key={index} style={styles.body}>{inline(part)}</Text>)}
  <Text style={styles.time}>{shortTime(message.created_at)}</Text>
 </View>;
});
// Web: creator #262626 with a small bottom-left corner, user #363636 with a small bottom-right corner.
const styles = StyleSheet.create({
 bubble: { maxWidth: '88%', padding: tokens.space[4], marginVertical: tokens.space[2], gap: tokens.space[2] },
 creator: { alignSelf: 'flex-start', backgroundColor: tokens.color.surfaceRaised, borderRadius: tokens.radius.lg, borderBottomLeftRadius: tokens.radius.xs },
 user: { alignSelf: 'flex-end', backgroundColor: tokens.color.lineStrong, borderRadius: tokens.radius.lg, borderBottomRightRadius: tokens.radius.xs },
 body: { ...textStyle('body'), color: tokens.color.ink },
 time: { ...textStyle('caption'), color: tokens.color.inkMuted }, code: { fontFamily: tokens.font.mono }, bold: { fontWeight: '700' }, link: { color: tokens.color.accent, textDecorationLine: 'underline' } });
