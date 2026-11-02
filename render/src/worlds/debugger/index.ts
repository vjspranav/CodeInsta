/** debugger: an IDE debug session (source, breakpoints, stepping, variables, call stack, console). See ./model.ts. */
import {defineWorld} from '../types';
import {DBG_ACTIONS, DBG_ID, dbgIsSignature, dbgProblems, dbgRows, dbgSettle, dbgStateAt, dbgTexts, dbgTimelineProblems, dbgTokens, validateDbg} from './model';
import type {DbgState} from './model';
import {DebuggerView} from './View';

export const debuggerWorld = defineWorld<DbgState>({
	id: DBG_ID,
	label: 'debugger',
	prefix: 'dbg.',
	actions: DBG_ACTIONS,
	signature: ['dbg.step', 'dbg.continue', 'dbg.stop', 'dbg.set', 'dbg.exit'],
	isSignature: dbgIsSignature,
	validate: (a) => validateDbg(a),
	stateAt: dbgStateAt,
	tokens: dbgTokens,
	rows: dbgRows,
	settle: dbgSettle,
	texts: dbgTexts,
	problems: dbgProblems,
	timelineProblems: dbgTimelineProblems,
	View: DebuggerView,
});
