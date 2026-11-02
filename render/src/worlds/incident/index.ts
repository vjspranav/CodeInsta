/** incident: an incident chat channel next to a live dashboard. See model.ts and ../README.md. */
import {defineWorld} from '../types';
import {
	INCIDENT_ACTIONS,
	INCIDENT_ID,
	incidentIsSignature,
	incidentProblems,
	incidentRows,
	incidentSettle,
	incidentStateAt,
	incidentTexts,
	incidentTimelineProblems,
	incidentTokens,
	validateIncident,
} from './model';
import type {IncidentState} from './model';
import {IncidentView} from './View';

export const incident = defineWorld<IncidentState>({
	id: INCIDENT_ID,
	label: 'incident room',
	prefix: 'incident.',
	actions: INCIDENT_ACTIONS,
	signature: ['incident.alert', 'incident.ticket'],
	isSignature: incidentIsSignature,
	validate: (a) => validateIncident(a),
	stateAt: incidentStateAt,
	tokens: incidentTokens,
	rows: incidentRows,
	settle: incidentSettle,
	texts: incidentTexts,
	problems: incidentProblems,
	timelineProblems: incidentTimelineProblems,
	View: IncidentView,
});
