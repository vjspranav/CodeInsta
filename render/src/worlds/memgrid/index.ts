/** memgrid: virtual memory (address split, page table, TLB, frames, faults, copy-on-write). See ../README.md. */
import {defineWorld} from '../types';
import {MEM_ACTIONS, MEM_ID, MEM_SIGNATURE, memProblems, memRows, memSettle, memStateAt, memTexts, memTimelineProblems, memTokens, validateMem} from './model';
import type {MemState} from './model';
import {MemgridView} from './View';

export const memgrid = defineWorld<MemState>({
	id: MEM_ID,
	label: 'memory grid',
	prefix: 'mem.',
	actions: MEM_ACTIONS,
	signature: MEM_SIGNATURE,
	validate: (a) => validateMem(a),
	stateAt: memStateAt,
	tokens: memTokens,
	rows: memRows,
	settle: memSettle,
	texts: memTexts,
	problems: memProblems,
	timelineProblems: memTimelineProblems,
	View: MemgridView,
});
