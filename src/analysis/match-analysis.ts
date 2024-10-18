import { decode } from '@firestone-hs/deckstrings';
import { Replay, parseHsReplayString } from '@firestone-hs/hs-replay-xml-parser/dist/public-api';
import { CardAnalysis, MatchAnalysis, ReplayUploadMetadata } from '@firestone-hs/replay-metadata';
import { ReviewMessage } from '../model';
import { allCards, s3 } from '../process-arena-match-stats';
import { cardDrawn } from './parsers/cards-draw-parser';
import { cardsInHand } from './parsers/cards-in-hand-parser';
import { ReplayParser } from './replay-parser';

export const buildMatchAnalysis = async (
	message: ReviewMessage,
	metadata: ReplayUploadMetadata | null,
): Promise<Pick<MatchAnalysis, 'cardsAnalysis'>> => {
	if (metadata?.stats?.matchAnalysis) {
		return metadata.stats.matchAnalysis;
	}

	console.warn('missing metadata', message.reviewId, message.metadataKey);
	const replay = await loadReplay(message.replayKey);
	const analysis = analyzeReplay(replay, message.playerDecklist);
	return analysis;
};

export const analyzeReplay = (replay: Replay, decklist: string): Pick<MatchAnalysis, 'cardsAnalysis'> => {
	const parser = new ReplayParser(replay, [cardsInHand, cardDrawn]);
	let cardsAfterMulligan: { cardId: string; kept: boolean }[] = [];
	let cardsBeforeMulligan: string[] = [];
	parser.on('cards-in-hand', (event) => {
		if (cardsBeforeMulligan?.length === 0) {
			cardsBeforeMulligan = event.cardsInHand;
		} else {
			cardsAfterMulligan = event.cardsInHand.map((cardId) => ({
				cardId: cardId,
				kept: cardsBeforeMulligan.includes(cardId),
			}));
		}
	});
	let cardsDrawn: { cardId: string; turn: number }[] = [];
	parser.on('card-draw', (event) => {
		// console.debug('card drawn', event.cardId);
		cardsDrawn = [...cardsDrawn, { cardId: event.cardId, turn: event.turn }];
	});
	parser.parse();
	parser.removeAllListeners();

	const deckDefinition = decode(decklist);
	// List of cards, ordered by id, including duplicates
	const deckCards = deckDefinition.cards
		.flatMap((pair) => new Array(pair[1]).fill(allCards.getCard(pair[0]).id))
		.sort();
	const cardsAnalysis: readonly CardAnalysis[] = deckCards.map((cardId) => {
		// Remove the info from cards after mulligan
		const cardAfterMulligan = cardsAfterMulligan.find((c) => c.cardId === cardId);
		if (cardAfterMulligan) {
			cardsAfterMulligan = cardsAfterMulligan.filter((c) => c !== cardAfterMulligan);
		}
		const cardBeforeMulliganIdx = cardsBeforeMulligan.indexOf(cardId);
		if (cardBeforeMulliganIdx !== -1) {
			// Remove the info from cardsBeforeMulligan array, but be careful not to remove duplicates
			cardsBeforeMulligan.splice(cardBeforeMulliganIdx, 1);
		}
		const cardDrawn = cardsDrawn.find((c) => c.cardId === cardId);
		if (cardDrawn) {
			cardsDrawn = cardsDrawn.filter((c) => c !== cardDrawn);
		}

		return {
			cardId: cardId,
			drawnBeforeMulligan: cardBeforeMulliganIdx !== -1,
			mulligan: !!cardAfterMulligan,
			kept: cardAfterMulligan?.kept ?? false,
			drawnTurn: cardDrawn?.turn,
		};
	});

	const result: Pick<MatchAnalysis, 'cardsAnalysis'> = {
		cardsAnalysis: cardsAnalysis,
	};
	return result;
};

export const loadReplay = async (replayKey: string): Promise<Replay> => {
	const replayString = await loadReplayString(replayKey);
	if (!replayString || replayString.length === 0) {
		return null;
	}
	const replay: Replay = parseHsReplayString(replayString, allCards);
	return replay;
};

const loadReplayString = async (replayKey: string): Promise<string> => {
	if (!replayKey) {
		return null;
	}
	const data = await s3.readZippedContent('xml.firestoneapp.com', replayKey);
	return data;
};
