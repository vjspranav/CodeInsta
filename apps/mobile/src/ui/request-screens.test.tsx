import { renderMotion } from './motion/testSetup';
import { act, fireEvent, screen } from '@testing-library/react-native';
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ Redirect: () => null, router: { push: jest.fn() }, useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]) }));
jest.mock('@/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'member' }, status: mockStatus, role: mockRole }) }));
jest.mock('@/push/register', () => ({ markMeaningfulAction: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ db: {} }));
jest.mock('@/data/requests', () => ({ ...jest.requireActual('@/data/requests'), myRequests: jest.fn(), submitRequest: jest.fn() }));
jest.mock('@/data/interests', () => ({ ...jest.requireActual('@/data/interests'), saveInterests: jest.fn() }));
jest.mock('@/data/library', () => ({ LIBRARY_KEY: ['library'], useLibrary: () => ({ library: mockLibrary, loading: false, error: '', reload: jest.fn() }) }));
const mockClient = { cancelQueries: jest.fn(), getQueryData: jest.fn(), setQueryData: jest.fn(), invalidateQueries: jest.fn() };
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => mockClient }));
jest.mock('@shopify/flash-list', () => ({ FlashList: ({ data, renderItem, ListHeaderComponent, ListEmptyComponent, ListFooterComponent }: any) => <>{ListHeaderComponent}{data.map((item: any, index: number) => require('react').createElement(require('react').Fragment, { key: item.id ?? item.slug }, renderItem({ item, index })))}{!data.length && ListEmptyComponent}{ListFooterComponent}</> }));
import Requests from '../../app/requests';
import Interests from '../../app/interests';
import { myRequests, submitRequest, PENDING_LIMIT_MESSAGE } from '@/data/requests';
import { saveInterests } from '@/data/interests';
import { markMeaningfulAction } from '@/push/register';
import { router } from 'expo-router';
let mockStatus = 'ready';
let mockRole = 'member';
const mockLibrary = { areas: ['systems'], categories: [{ slug: 'systems', label: 'Systems', description: 'Under the hood' }, { slug: 'databases', label: 'Databases', description: 'Store things' }] };
const activate = (id: string) => fireEvent(screen.getByTestId(id), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
beforeEach(() => { jest.clearAllMocks(); mockStatus = 'ready'; mockRole = 'member'; jest.mocked(myRequests).mockResolvedValue([]); jest.mocked(submitRequest).mockResolvedValue(''); jest.mocked(saveInterests).mockResolvedValue(''); mockClient.getQueryData.mockReturnValue(mockLibrary); });
it('sends the selected area and preserves the text with the returned friendly error', async () => {
  jest.mocked(submitRequest).mockResolvedValue(PENDING_LIMIT_MESSAGE);
  await renderMotion(<Requests />);
  await activate('request-area-systems');
  await fireEvent.changeText(screen.getByTestId('request-input'), 'How does ART work?');
  await activate('request-send');
  expect(submitRequest).toHaveBeenCalledWith('member', 'systems', 'How does ART work?');
  expect(screen.getByText(PENDING_LIMIT_MESSAGE)).toBeTruthy();
  expect(screen.getByTestId('request-input').props.value).toBe('How does ART work?');
});
it('does not send short requests and clears successful requests', async () => {
  await renderMotion(<Requests />);
  await fireEvent.changeText(screen.getByTestId('request-input'), 'ab'); await activate('request-send');
  expect(submitRequest).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByTestId('request-input'), 'Good topic'); await activate('request-send');
  expect(screen.getByTestId('request-input').props.value).toBe('');
});
it('shows statuses and opens a fulfilled reel', async () => {
  jest.mocked(myRequests).mockResolvedValue(['pending', 'approved', 'rejected', 'done'].map((status, index) => ({ id: String(index), user_id: 'member', body: `Topic ${index}`, area: null, status: status as any, created_at: '', fulfilled_reel_id: status === 'done' ? 'reel-1' : null })));
  await renderMotion(<Requests />);
  for (const status of ['Pending review', 'Approved', 'Not now', 'Done']) expect(screen.getByText(status)).toBeTruthy();
  await activate('request-reel-3');
  expect(router.push).toHaveBeenCalledWith({ pathname: '/reel/[id]', params: { id: 'reel-1' } });
});
it('edits interests and saves the selected categories', async () => {
  await renderMotion(<Interests />);
  await activate('interest-databases'); await activate('interests-save');
  expect(saveInterests).toHaveBeenCalledWith('member', ['systems', 'databases']);
  expect(screen.getByText('Saved.')).toBeTruthy();
});
it('requires at least one interest and rolls back a failed save', async () => {
  jest.mocked(saveInterests).mockResolvedValue('Could not save your interests. Try again.');
  await renderMotion(<Interests />);
  await activate('interest-systems'); await activate('interests-save');
  expect(saveInterests).not.toHaveBeenCalled(); expect(screen.getByText('Pick at least one topic.')).toBeTruthy();
  await activate('interest-databases'); await activate('interests-save');
  expect(screen.getByText('Could not save your interests. Try again.')).toBeTruthy();
  expect(mockClient.setQueryData).toHaveBeenLastCalledWith(['library', 'member'], mockLibrary);
});
it('does not display member data when signed out', async () => {
  mockStatus = 'signedOut'; await renderMotion(<Requests />);
  expect(myRequests).not.toHaveBeenCalled(); expect(screen.queryByTestId('request-input')).toBeNull();
});
it('shows a retryable request load error', async () => {
  jest.mocked(myRequests).mockRejectedValueOnce(new Error('offline'));
  await renderMotion(<Requests />);
  expect(screen.getByText('Could not load your requests. Try again.')).toBeTruthy();
  await fireEvent(screen.getByLabelText('Refresh requests'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  expect(screen.queryByText('Could not load your requests. Try again.')).toBeNull();
});
it('rolls back the optimistic request when transport rejects', async () => {
  jest.mocked(submitRequest).mockRejectedValueOnce(new Error('offline'));
  await renderMotion(<Requests />);
  await fireEvent.changeText(screen.getByTestId('request-input'), 'Learning schedulers'); await activate('request-send');
  expect(screen.getByText('Could not save your request. Try again.')).toBeTruthy();
  expect(screen.queryByText('Pending review')).toBeNull();
  expect(screen.getByTestId('request-input').props.value).toBe('Learning schedulers');
});

it('marks a successful request as meaningful engagement', async () => {
  await renderMotion(<Requests />);
  await fireEvent.changeText(screen.getByTestId('request-input'), 'Good topic'); await activate('request-send');
  expect(markMeaningfulAction).toHaveBeenCalledTimes(1);
});
it('shows approved optimistically for owner requests and blocks refresh while sending', async () => {
  mockRole = 'owner';
  let finish!: (value: string) => void;
  jest.mocked(submitRequest).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await renderMotion(<Requests />);
  await fireEvent.changeText(screen.getByTestId('request-input'), 'Owner topic'); await activate('request-send');
  expect(screen.getByText('Approved')).toBeTruthy();
  await fireEvent(screen.getByLabelText('Refresh requests'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  expect(myRequests).toHaveBeenCalledTimes(1);
  await act(async () => finish(''));
});
