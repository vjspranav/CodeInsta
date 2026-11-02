import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import type { MobileReel } from "@shared/types";
import { tokens } from "@/theme/tokens";
import { TID } from "@/testids";
import { PressableScale } from "./motion/PressableScale";
export const ReelTile = memo(function ReelTile({ reel, creatorName, grid = false, testID = TID["explore-tile"] }: {
    testID?: string;
    reel: MobileReel;
    creatorName: string;
    grid?: boolean;
}) {
    const part = reel.series_index ? `Part ${reel.series_index}` : '';
    return <PressableScale testID={testID} accessibilityRole="link" accessibilityLabel={[reel.title, creatorName, part].filter(Boolean).join(', ')}
        style={[styles.tile, grid && styles.grid]}
        onPress={() => router.push({ pathname: '/reel/[id]', params: { id: reel.id } })}>
 <Image source={reel.poster_url ? { uri: reel.poster_url } : undefined} placeholder={{ uri: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1">
        <rect width="1" height="1" fill="${tokens.color.panel}"/>
        </svg>`)}` }} cachePolicy="memory-disk" recyclingKey={reel.id} contentFit="cover" style={styles.poster}/>
 <View style={styles.copy}>
        <Text numberOfLines={2} style={styles.title}>{reel.title}</Text>
        <Text style={styles.meta}>{creatorName}{part ? ` · ${part}` : ''}</Text>
        </View>
 </PressableScale>;
});
const styles = StyleSheet.create({ tile: { width: tokens.layout.contentMaxWidth / 4, paddingRight: tokens.space[3], paddingBottom: tokens.space[4] }, grid: { width: '100%', flex: 1 }, poster: { width: '100%', aspectRatio: 720 / 1280, borderRadius: tokens.radius.md, backgroundColor: tokens.color.panel }, copy: { gap: tokens.space[1], paddingTop: tokens.space[2] }, title: { ...tokens.type.reelTitle, color: tokens.color.ink }, meta: { ...tokens.type.caption, color: tokens.color.inkMuted } });
