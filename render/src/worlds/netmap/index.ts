/** netmap: a network topology with packets, links that fail, crowns that move, buffers that overflow. See ./model.ts. */
import {defineWorld} from '../types';
import {netProblems, netTexts} from './layout';
import {NET_ACTIONS, NET_ID, netIsSignature, netRows, netSettle, netStateAt, netTimelineProblems, netTokens, validateNet} from './model';
import type {NetState} from './model';
import {NetMapView} from './View';

export const netmap = defineWorld<NetState>({
	id: NET_ID,
	label: 'network map',
	prefix: 'nm.',
	actions: NET_ACTIONS,
	signature: ['nm.cut', 'nm.partition', 'nm.drop', 'nm.down', 'nm.role', 'nm.buffer'],
	isSignature: netIsSignature,
	validate: (a) => validateNet(a),
	stateAt: netStateAt,
	tokens: netTokens,
	rows: netRows,
	settle: netSettle,
	texts: netTexts,
	problems: netProblems,
	timelineProblems: netTimelineProblems,
	View: NetMapView,
});
