/* eslint-disable no-extra-boolean-cast */
import { AllCardsService, normalizeDeckList } from '@firestone-hs/reference-data';
import { MatchAnalysis, ReplayUploadMetadata } from '@firestone-hs/replay-metadata';
import serverlessMysql from 'serverless-mysql';
import { buildMatchAnalysis } from './analysis/match-analysis';
import { ReviewMessage } from './model';
import { s3 } from './process-arena-match-stats';

export const handleArenaMessage = async (
	message: ReviewMessage,
	mysql: serverlessMysql.ServerlessMysql,
	allCards: AllCardsService,
): Promise<void> => {
	const debug = message.userName === 'daedin';
	debug && console.log('handling arena message', message.userName, message.reviewId, message);
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
	const debug = message.userName === 'daedin';
	debug && console.log('will load metadata?', message.userName, message.reviewId, message.metadataKey);
	const metadata = await loadMetaDataFile(message.metadataKey);

	let matchAnalysis: Pick<MatchAnalysis, 'cardsAnalysis'> = null;
	try {
		// console.debug('building match analysis');
		// TODO: this is copy/pasted from trigger-assign-archetype
		matchAnalysis = await buildMatchAnalysis(message, metadata);
	} catch (e) {
		console.error('Could not build match analysis', e);
	}
	debug && console.debug('normalizing decklist');
	const normalizedDecklist =
		metadata?.game?.normalizedDeckstring ?? normalizeDeckList(message.playerDecklist, allCards);
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
	debug && console.debug('running query');
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

const isMessageValid = (message: ReviewMessage): boolean => {
	return !!message.additionalResult?.includes('-') && !!message.playerDecklist?.length;
};

const loadMetaDataFile = async (fileKey: string): Promise<ReplayUploadMetadata | null> => {
	const replayString = await s3.readZippedContent('com.zerotoheroes.batch', fileKey);
	let fullMetaData: ReplayUploadMetadata | null = null;
	if (replayString?.startsWith('{')) {
		const metadataStr = replayString;
		if (!!metadataStr?.length) {
			console.debug('got metadata');
			fullMetaData = JSON.parse(metadataStr);
		}
	}
	return fullMetaData;
};
