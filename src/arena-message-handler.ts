/* eslint-disable no-extra-boolean-cast */
import { AllCardsService } from '@firestone-hs/reference-data';
import { MatchAnalysis, ReplayUploadMetadata } from '@firestone-hs/replay-metadata';
import serverlessMysql from 'serverless-mysql';
import { ReviewMessage } from './model';
import { s3 } from './process-arena-match-stats';

export const addArenaMatchStat = async (
	mysql: serverlessMysql.ServerlessMysql,
	message: ReviewMessage,
	metadata: ReplayUploadMetadata,
	allCards: AllCardsService,
): Promise<void> => {
	const matchAnalysis: Pick<MatchAnalysis, 'cardsAnalysis'> = metadata.stats.matchAnalysis;
	const normalizedDecklist =
		metadata?.game?.normalizedDeckstring ?? allCards.normalizeDeckList(message.playerDecklist);
	const [wins, losses] = message.additionalResult.split('-').map((result) => parseInt(result));
	const insertQuery = `
		INSERT IGNORE INTO arena_match_stats
		(
			creationDate,
			buildNumber,
			reviewId,
			runId,
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
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`;
	// debug && console.debug('running query');
	await mysql.query(insertQuery, [
		message.creationDate,
		message.buildNumber,
		message.reviewId,
		message.runId,
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

export const isMessageValid = (message: ReviewMessage): boolean => {
	return !!message.additionalResult?.includes('-') && !!message.playerDecklist?.length;
};

export const loadMetaDataFile = async (
	message: ReviewMessage,
): Promise<{ message: ReviewMessage; metadata: ReplayUploadMetadata | null }> => {
	const replayString = await s3.readZippedContent('com.zerotoheroes.batch', message.metadataKey);
	let fullMetaData: ReplayUploadMetadata | null = null;
	if (replayString?.startsWith('{')) {
		const metadataStr = replayString;
		if (!!metadataStr?.length) {
			fullMetaData = JSON.parse(metadataStr);
		}
	}
	return { message, metadata: fullMetaData };
};
