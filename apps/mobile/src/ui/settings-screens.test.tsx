import { renderMotion } from './motion/testSetup';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ Redirect: ({ href }: any) => require('react').createElement(require('react-native').Text, {}, href), router: { push: jest.fn() }, useFocusEffect: (fn: any) => require('react').useEffect(fn, [fn]) }));
const mockSignOut = jest.fn(async () => {});
let mockRole = 'owner';
let mockStatus = 'ready';
jest.mock('@/auth/useAuth', () => ({ useAuth: () => ({ role: mockRole, status: mockStatus, user: { id: 'member' }, signOut: mockSignOut }) }));
jest.mock('@/data/owner', () => ({ pendingCount: jest.fn(async () => 3) }));
jest.mock('@/push/register', () => ({ registerPush: jest.fn(async () => 'registered'), unregisterPush: jest.fn(async () => {}) }));
jest.mock('@/lib/secure-storage', () => ({ secureStorage: { getItem: jest.fn(async () => null) } }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0' } } }));
import Settings from '../../app/settings';
import { ProfileSettings } from './ProfileSettings';
import { pendingCount } from '@/data/owner';
import { registerPush, unregisterPush } from '@/push/register';
import { router } from 'expo-router';
const activate = (id: string) => fireEvent(screen.getByTestId(id), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
beforeEach(() => { jest.clearAllMocks(); mockRole = 'owner'; mockStatus = 'ready'; });
it('shows owner entry badge on focus and routes all profile settings', async () => {
  await renderMotion(<ProfileSettings />);
  await waitFor(() => expect(screen.getByTestId('pending-badge').props.children).toBe(3));
  expect(pendingCount).toHaveBeenCalledTimes(1);
  await activate('owner-requests');
  expect(router.push).toHaveBeenCalledWith('/admin/requests');
  await activate('settings-interests');
  expect(router.push).toHaveBeenCalledWith('/interests');
});
it('hides owner entries and does not query owner count for members', async () => {
  mockRole = 'member';
  await renderMotion(<ProfileSettings />);
  expect(screen.queryByTestId('owner-requests')).toBeNull();
  expect(screen.queryByTestId('owner-invites')).toBeNull();
  expect(pendingCount).not.toHaveBeenCalled();
});
it('registers and unregisters notifications and signs out', async () => {
  await renderMotion(<Settings />);
  await waitFor(() => expect(screen.getByTestId('settings-notifications').props.disabled).toBe(false));
  await fireEvent(screen.getByTestId('settings-notifications'), 'valueChange', true);
  await waitFor(() => expect(registerPush).toHaveBeenCalledWith('member'));
  await fireEvent(screen.getByTestId('settings-notifications'), 'valueChange', false);
  await waitFor(() => expect(unregisterPush).toHaveBeenCalledWith('member'));
  await activate('settings-signout');
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Version 1.0.0')).toBeTruthy();
});
it('rolls back denied notification permission with inline explanation', async () => {
  (registerPush as jest.Mock).mockResolvedValueOnce('denied');
  await renderMotion(<Settings />);
  await waitFor(() => expect(screen.getByTestId('settings-notifications').props.disabled).toBe(false));
  await fireEvent(screen.getByTestId('settings-notifications'), 'valueChange', true);
  await waitFor(() => expect(screen.getByText('Notifications are disabled in your device settings.')).toBeTruthy());
  expect(screen.getByTestId('settings-notifications').props.value).toBe(false);
});
it('guards settings after sign out', async () => {
  mockStatus = 'signedOut';
  await renderMotion(<Settings />);
  expect(screen.queryByTestId('settings-notifications')).toBeNull();
});
it('holds the settings route while auth loads', async () => {
  mockStatus = 'loading';
  await renderMotion(<Settings />);
  expect(screen.getByLabelText('Loading settings')).toBeTruthy();
  expect(screen.queryByText('/(tabs)')).toBeNull();
});
