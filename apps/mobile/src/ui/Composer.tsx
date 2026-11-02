import { StyleSheet, Text, TextInput, View } from 'react-native';
import { MESSAGE_MAX } from '@/data/inbox';
import { textStyle } from '@/ui/feed/styles';
import { tokens } from '@/theme/tokens';
import { TID } from '@/testids';
import { MorphButton } from './motion/MorphButton';
import { ShakeOnError } from './motion/ShakeOnError';
export function Composer({ name, value, onChange, onSend, busy, error }: { name: string; value: string; onChange: (value: string) => void; onSend: () => void; busy: boolean; error: string }) {
 return <ShakeOnError trigger={error}><View style={styles.row}>
  <TextInput testID={TID['dm-input']} accessibilityLabel="Your reply" placeholder={`Message ${name}…`} placeholderTextColor={tokens.color.inkMuted} value={value} onChangeText={onChange} multiline maxLength={MESSAGE_MAX} editable={!busy} style={styles.input} />
  <MorphButton testID={TID['dm-send']} label="Send" accessibilityLabel="Send reply" busy={busy} disabled={!value.trim()} onPress={onSend} style={styles.send} />
 </View>{!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}</ShakeOnError>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'flex-end', gap: tokens.space[2], paddingVertical: tokens.space[3] }, input: { flex: 1, ...textStyle('input'), color: tokens.color.ink, backgroundColor: tokens.color.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.color.lineStrong, borderRadius: tokens.radius.xl, paddingHorizontal: tokens.space[4], padding: tokens.space[3], minHeight: tokens.layout.controlHeight, maxHeight: tokens.layout.controlHeight * 3 }, send: { width: tokens.layout.controlHeight * 2 }, error: { ...textStyle('bodySmall'), color: tokens.color.danger, paddingBottom: tokens.space[3] } });
