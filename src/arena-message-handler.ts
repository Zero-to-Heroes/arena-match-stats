import { AllCardsService, normalizeDeckList } from '@firestone-hs/reference-data';
import serverlessMysql from 'serverless-mysql';
import { buildMatchAnalysis } from './analysis/match-analysis';
import { MatchAnalysis, ReviewMessage } from './model';

export const handleArenaMessage = async (
	message: ReviewMessage,
	mysql: serverlessMysql.ServerlessMysql,
	allCards: AllCardsService,
): Promise<void> => {
	const isValid = isMessageValid(message);
	if (!isValid) {
		return;
	}

	await addArenaMatchStat(mysql, message, allCards);
};

export const addArenaMatchStat = async (
	mysql: serverlessMysql.ServerlessMysql,
	message: ReviewMessage,
	allCards: AllCardsService,
): Promise<void> => {
	let matchAnalysis: MatchAnalysis = null;
	try {
		// TODO: this is copy/pasted from trigger-assign-archetype
		matchAnalysis = await buildMatchAnalysis(message);
	} catch (e) {
		console.error('Could not build match analysis', e);
	}
	const normalizedDecklist = normalizeDeckList(message.playerDecklist, allCards);
	const [wins, losses] = message.additionalResult.split('-').map((result) => parseInt(result));
	const insertQuery = `
		INSERT IGNORE INTO arena_match_stats
		(
			creationDate,
			buildNumber,
			reviewId,
            wins,
            losses,
			playerClass,
			opponentClass,
			result,
			playerDecklist,
			durationTurns,
			durationSeconds,
            matchAnalysis
		)
		VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`;
	await mysql.query(insertQuery, [
		message.creationDate,
		message.buildNumber,
		message.reviewId,
		wins,
		losses,
		message.playerClass,
		message.opponentClass,
		message.result,
		normalizedDecklist,
		null,
		null,
		JSON.stringify(matchAnalysis),
	]);
};

const isMessageValid = (message: ReviewMessage): boolean => {
	return !!message.additionalResult?.includes('-') && !!message.playerDecklist?.length;
};
