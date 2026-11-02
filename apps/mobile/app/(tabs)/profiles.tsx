import { EnterStagger } from "@/ui/motion/EnterStagger";
import { FlashList } from "@shopify/flash-list";
import { Text, View } from "react-native";
import { Flame } from "lucide-react-native";
import { useLibrary } from "@/data/library";
import { useFeedSession } from "@/data/feedSession";
import { tokens } from "@/theme/tokens";
import { TID } from "@/testids";
import { Screen } from "@/ui/Screen";
import { EmptyState } from "@/ui/EmptyState";
import { CatalogState, SectionHeader } from "@/ui/SectionHeader";
import { CreatorRow } from "@/ui/CreatorRow";
import { Button } from "@/ui/Button";
import { ProfileSettings } from "@/ui/ProfileSettings";
import { useAuth } from "@/auth/useAuth";
export default function Profiles() {
    const { library, loading, error, reload } = useLibrary();
    const { streak } = useFeedSession();
    const { signOut } = useAuth();
    return <Screen bottomInset={false}>
        <EnterStagger>
        <SectionHeader title="Your creators" subtitle="Two perspectives. A deeper understanding."/>
        </EnterStagger>{streak > 0 ? <View testID={TID['streak-chip']} style={{ flexDirection: 'row', gap: tokens.space[2], alignItems: 'center', paddingBottom: tokens.space[4] }}>
        <Flame color={tokens.color.inkMuted} size={tokens.space[4]}/>
        <Text style={{ ...tokens.type.meta, color: tokens.color.ink }}>{streak} day streak</Text>
        </View> : null}
 <FlashList data={loading || error ? [] : library?.creators ?? []}
        ListHeaderComponent={loading || error ? <CatalogState loading={loading} error={error} reload={reload}/> : null}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <CreatorRow creator={item}/>}
        ListEmptyComponent={loading || error ? null : <EmptyState title="No creators yet" body="The creators behind each series will show up here."/>}
        ListFooterComponent={<><ProfileSettings /><Button variant="ghost" label="Sign out" testID={TID['settings-signout']} onPress={() => void signOut()} style={{ marginTop: tokens.space[6] }}/></>}/></Screen>;
}
