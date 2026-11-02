import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { tokens } from "@/theme/tokens";
import { EmptyState } from "./EmptyState";
import { Button } from "./Button";
import { TID } from "@/testids";
export const SectionHeader = memo(function SectionHeader({ title, subtitle }: {
    title: string;
    subtitle?: string;
}) {
    return <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View>;
});
export function CatalogState({ loading, error, reload }: {
    loading: boolean;
    error: string;
    reload(): void;
}) {
    if (loading)
        return <View accessibilityLabel="Loading reels" accessibilityState={{ busy: true }} style={styles.header}>{[0, 1, 2].map(key => <View key={key} style={styles.skeleton}/>)}</View>;
    return <View>
        <EmptyState title="Could not load your library" body={error}/>
        <Button testID={TID["reel-retry"]} label="Try again"
        onPress={reload}/>
        </View>;
}
const styles = StyleSheet.create({ header: { gap: tokens.space[2], paddingVertical: tokens.space[5] }, title: { ...tokens.type.heading, color: tokens.color.ink }, subtitle: { ...tokens.type.bodySmall, color: tokens.color.inkMuted }, skeleton: { height: tokens.layout.headerHeight, backgroundColor: tokens.color.panel, borderRadius: tokens.radius.md } });
