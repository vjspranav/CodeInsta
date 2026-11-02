import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { ChevronRight } from "lucide-react-native";
import { router } from "expo-router";
import type { Creator } from "@shared/types";
import { tokens } from "@/theme/tokens";
import { TID } from "@/testids";
import { PressableScale } from "./motion/PressableScale";
export const CreatorRow = memo(function CreatorRow({ creator }: {
    creator: Creator;
}) {
    return <PressableScale testID={TID["profile-row"]} accessibilityRole="link" accessibilityLabel={creator.display_name}
        onPress={() => router.push({ pathname: '/c/[creator]', params: { creator: creator.id } })} style={styles.row}>
 <Image source={creator.avatar_url ? { uri: creator.avatar_url } : undefined} placeholder={{ uri: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1">
        <rect width="1" height="1" fill="${tokens.color.panel}"/>
        </svg>`)}` }} cachePolicy="memory-disk" recyclingKey={creator.id} style={styles.avatar}/>
 <View style={styles.copy}>
        <Text style={styles.title}>{creator.display_name}</Text>
        <Text style={styles.meta}>{creator.handle}</Text>
        <Text numberOfLines={2} style={styles.meta}>{creator.bio}</Text>
        </View>
        <ChevronRight color={tokens.color.inkMuted} size={tokens.space[5]}/>
 </PressableScale>;
});
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[3], paddingVertical: tokens.space[5] }, avatar: { width: tokens.layout.headerHeight, height: tokens.layout.headerHeight, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.panel }, copy: { flex: 1, gap: tokens.space[1] }, title: { ...tokens.type.heading, color: tokens.color.ink }, meta: { ...tokens.type.bodySmall, color: tokens.color.inkMuted } });
