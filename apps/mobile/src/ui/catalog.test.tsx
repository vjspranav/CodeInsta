jest.mock('lucide-react-native', () => ({ Compass: require('react-native').View, Users: require('react-native').View, ChevronRight: require('react-native').View, Flame: require('react-native').View }));
import { renderMotion } from './motion/testSetup';
import { fireEvent, screen } from '@testing-library/react-native';
import type { MobileReel } from '@shared/types';
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/auth/useAuth', () => ({ useAuth: () => ({ status: mockStatus }) }));
jest.mock('expo-router', () => ({ Redirect: () => null, router: { push: jest.fn() }, useLocalSearchParams: () => ({ creator: 'gpt' }) }));
jest.mock('expo-image', () => ({ Image: (props: any) => require('react').createElement(require('react-native').View, { ...props, accessibilityLabel: props.source?.uri }) }));
jest.mock('@shopify/flash-list', () => ({ FlashList: ({ data, renderItem, ListHeaderComponent, ListEmptyComponent }: any) => <>{ListHeaderComponent}{data.map((item: any, index: number) => require('react').createElement(require('react').Fragment, { key: item.id ?? item.category.slug }, renderItem({ item, index })))}{!data.length && ListEmptyComponent}</> }));
jest.mock('@/data/library', () => ({ useLibrary: () => mockState }));
jest.mock('@/data/feedSession', () => ({ useFeedSession: () => ({ streak: mockStreak }) }));
import { router } from 'expo-router';
import Explore from '../../app/(tabs)/explore';
import Profiles from '../../app/(tabs)/profiles';
import Creator from '../../app/c/[creator]';
const reel = (id: string, title: string, part: number): MobileReel => ({ id, title, series_index: part, creator_id: 'gpt', topic: 'systems/test', tags: ['kernel'], series: 'story', created_at: `2026-11-0${part}`, poster_url: `https://example.com/${id}.jpg`, video_url: '', glossary: null, parent_reel_id: null, genre: null, style: null, expires_at: null });
const library = { reels: [reel('two', 'Second lesson', 2), reel('one', 'First lesson', 1)], categories: [{ slug: 'systems', label: 'Systems', description: 'Under the hood' }], creators: [{ id: 'gpt', display_name: 'GPT', handle: '@gpt', bio: 'Learn deeply', avatar_url: null }] };
let mockState: any;
let mockStreak = 0;
let mockStatus = 'ready';
beforeEach(() => { mockState = { library, loading: false, error: '', reload: jest.fn() }; mockStreak = 0; mockStatus = 'ready'; jest.clearAllMocks(); });
it('searches and opens a matching reel, with a no-results state', async () => {
    await renderMotion(<Explore />);
    await fireEvent.changeText(screen.getByTestId('explore-search'), 'First');
    expect(screen.queryByText('Second lesson')).toBeNull();
    expect(screen.getByLabelText('https://example.com/one.jpg').props.cachePolicy).toBe('memory-disk');
    expect(screen.getByLabelText('https://example.com/one.jpg').props.placeholder).toBeTruthy();
    await fireEvent(screen.getByTestId('explore-tile'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(router.push).toHaveBeenCalledWith({ pathname: '/reel/[id]', params: { id: 'one' } });
    await fireEvent.changeText(screen.getByTestId('explore-search'), 'missing');
    expect(screen.getByText('No reels found')).toBeTruthy();
});
it('hides zero streak and opens creator rows', async () => {
    await renderMotion(<Profiles />);
    expect(screen.queryByTestId('streak-chip')).toBeNull();
    await fireEvent(screen.getByTestId('profile-row'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(router.push).toHaveBeenCalledWith({ pathname: '/c/[creator]', params: { creator: 'gpt' } });
});
it('shows positive streak', async () => { mockStreak = 3; await renderMotion(<Profiles />); expect(screen.getByTestId('streak-chip')).toBeTruthy(); expect(screen.getByText('3 day streak')).toBeTruthy(); });
it('renders creator biography and earlier series parts first', async () => {
    await renderMotion(<Creator />);
    expect(screen.getByText('Learn deeply')).toBeTruthy();
    expect(screen.getAllByTestId('profile-reel').map(node => node.props.accessibilityLabel)).toEqual(['First lesson, GPT, Part 1', 'Second lesson, GPT, Part 2']);
});
it('shows loading skeletons and retryable errors', async () => {
    mockState = { ...mockState, library: null, loading: true };
    const view = await renderMotion(<Explore />);
    expect(screen.getByLabelText('Loading reels')).toBeTruthy();
    mockState = { ...mockState, loading: false, error: 'Offline' };
    await view.rerender(<Explore />);
    await fireEvent(screen.getByTestId('reel-retry'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(mockState.reload).toHaveBeenCalled();
});
it('hides cached creator data after sign-out', async () => { mockStatus = 'signedOut'; await renderMotion(<Creator />); expect(screen.queryByText('Learn deeply')).toBeNull(); });

it('clearing search restores category rails', async () => {
    await renderMotion(<Explore />);
    await fireEvent.changeText(screen.getByTestId('explore-search'), 'missing');
    expect(screen.queryByText('Systems')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('explore-search'), '');
    expect(screen.getByText('Systems')).toBeTruthy();
    expect(screen.getAllByTestId('explore-tile')).toHaveLength(2);
});
it('creator grid tiles open their reel', async () => {
    await renderMotion(<Creator />);
    await fireEvent(screen.getAllByTestId('profile-reel')[0], 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(router.push).toHaveBeenCalledWith({ pathname: '/reel/[id]', params: { id: 'one' } });
});
it('handles empty libraries and missing creators', async () => {
    mockState.library = { ...library, reels: [], categories: [], creators: [] };
    const view = await renderMotion(<Explore />);
    expect(screen.getByText('Nothing new yet')).toBeTruthy();
    await view.rerender(<Creator />);
    expect(screen.getByText('Creator not found')).toBeTruthy();
});
