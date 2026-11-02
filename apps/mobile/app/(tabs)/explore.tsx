import { EnterStagger } from "@/ui/motion/EnterStagger";
import { memo, useMemo, useState } from "react";
import { FlashList } from "@shopify/flash-list";
import { View } from "react-native";
import type { Creator } from "@shared/types";
import { exploreSections, searchReels, type ExploreSection } from "@/data/explore";
import { useLibrary } from "@/data/library";
import { TID } from "@/testids";
import { Screen } from "@/ui/Screen";
import { TextField } from "@/ui/TextField";
import { EmptyState } from "@/ui/EmptyState";
import { CatalogState, SectionHeader } from "@/ui/SectionHeader";
import { ReelTile } from "@/ui/ReelTile";
const Rail = memo(function Rail({ section, creators }: {
    section: ExploreSection;
    creators: Creator[];
}) {
    return <View>
        <SectionHeader title={section.category.label} subtitle={section.category.description}/>
        <FlashList horizontal data={section.reels}
        keyExtractor={item => item.id} showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => <ReelTile reel={item} creatorName={creators.find(c => c.id === item.creator_id)?.display_name ?? item.creator_id}/>}/>
        </View>;
});
export default function Explore() {
    const { library, loading, error, reload } = useLibrary();
    const [query, setQuery] = useState('');
    const sections = useMemo(() => library ? exploreSections(library) : [], [library]);
    const results = useMemo(() => library ? searchReels(library, query) : [], [library, query]);
    return <Screen bottomInset={false}>
        <EnterStagger>
        <SectionHeader title="Explore" subtitle="Follow your curiosity"/>
        </EnterStagger>
        <TextField label="Search reels" placeholder="Titles, topics, or tags" testID={TID['explore-search']} value={query} onChangeText={setQuery}/>
 {loading || error ? <CatalogState loading={loading} error={error} reload={reload}/>
        : query.trim() ? <FlashList data={results}
        keyExtractor={item => item.id} numColumns={2} keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <ReelTile grid reel={item} creatorName={library?.creators.find(c => c.id === item.creator_id)?.display_name ?? item.creator_id}/>}
        ListEmptyComponent={<EmptyState title="No reels found" body="Try another title, topic, or tag."/>}/>

        : <FlashList data={sections}
        keyExtractor={item => item.category.slug}
        renderItem={({ item }) => <Rail section={item} creators={library?.creators ?? []}/>}
        ListEmptyComponent={<EmptyState title="Nothing new yet" body="New lessons are on their way."/>}/>}</Screen>;
}
