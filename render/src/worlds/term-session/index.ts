/** term.session: the reference world (a real terminal session). See ../README.md. */
import {defineWorld} from '../types';
import {
	planSession,
	TERM_ACTIONS,
	TERM_ID,
	termIsSignature,
	termProblems,
	termRows,
	termSettle,
	termStateAt,
	termTexts,
	termTokens,
	validateTerm,
} from './model';
import type {TermState} from './model';
import {TermSessionView} from './View';

export const termSession = defineWorld<TermState>({
	id: TERM_ID,
	label: 'terminal session',
	prefix: 'term.',
	actions: TERM_ACTIONS,
	signature: ['term.run', 'term.out', 'term.exit'],
	isSignature: termIsSignature,
	validate: (a) => validateTerm(a),
	stateAt: termStateAt,
	tokens: termTokens,
	rows: termRows,
	settle: termSettle,
	texts: termTexts,
	problems: termProblems,
	timelineProblems: (events) => planSession(events).issues,
	View: TermSessionView,
});
