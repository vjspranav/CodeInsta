import {defineWorld} from '../types';
import {NETWORK_ID, NETWORK_ACTIONS, networkIsSignature, networkProblems, networkRows, networkSettle, networkStateAt, networkTexts, networkTimelineProblems, networkTokens, validateNetwork, type NetworkState} from './model';
import {BrowserNetworkView} from './View';
export const browserNetwork = defineWorld<NetworkState>({
 id: NETWORK_ID, label: 'browser Network panel', prefix: 'net.', actions: NETWORK_ACTIONS,
 signature: ['net.request', 'net.select'], isSignature: networkIsSignature,
 validate: validateNetwork, stateAt: networkStateAt, tokens: networkTokens, rows: networkRows,
 settle: networkSettle, texts: networkTexts, problems: networkProblems, timelineProblems: networkTimelineProblems,
 View: BrowserNetworkView,
});
