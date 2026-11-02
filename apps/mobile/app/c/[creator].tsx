import { TID } from "@/testids";
import { useMemo } from "react";
import { FlashList } from "@shopify/flash-list";
import { Redirect, useLocalSearchParams } from "expo-router";
import { creatorReels } from "@/data/profiles";
import { useLibrary } from "@/data/library";
import { useAuth } from "@/auth/useAuth";
import { routeForStatus } from "@/ui/shell/authRoute";
import { Screen } from "@/ui/Screen";
import { EmptyState } from "@/ui/EmptyState";
import { CatalogState, SectionHeader } from "@/ui/SectionHeader";
import { ReelTile } from "@/ui/ReelTile";
import { CreatorAvatar } from "@/ui/CreatorAvatar";
import { View } from "react-native";
import { tokens } from "@/theme/tokens";
export default function CreatorPage() {
    const { status } = useAuth();
    const route = routeForStatus(status);
    if (route !== '(tabs)')
        return route ? <Redirect href={`/${route}`}/>
        : null;
    return <CreatorContent />;
}
function CreatorContent() {
    const { creator: parameter } = useLocalSearchParams<{
        creator: string | string[];
    }>();
    const id = Array.isArray(parameter) ? parameter[0] : parameter;
    const { library, loading, error, reload } = useLibrary();
    const creator = library?.creators.find(item => item.id === id);
    const reels = useMemo(() => library ? creatorReels(library, id ?? '') : [], [library, id]);
    return <Screen>{loading || error ? <CatalogState loading={loading} error={error} reload={reload}/>
        : !creator ? <EmptyState title="Creator not found"/>

        : <FlashList data={reels} numColumns={2}
        keyExtractor={item => item.id}
        ListHeaderComponent={<>
        <View style={{ paddingTop: tokens.space[4] }}><CreatorAvatar creatorId={creator.id} size={tokens.layout.headerHeight + tokens.space[5]}/></View>
        <SectionHeader title={creator.display_name} subtitle={creator.handle}/>
        <SectionHeader title={`${reels.length} reels`} subtitle={creator.bio}/>
        </>}
        renderItem={({ item }) => <ReelTile testID={TID["profile-reel"]} grid reel={item} creatorName={creator.display_name}/>}
        ListEmptyComponent={<EmptyState title="Nothing new yet" body="New lessons are on their way."/>}/>}</Screen>;
}
