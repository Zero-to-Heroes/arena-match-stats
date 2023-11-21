import { parseHsReplayString, Replay } from '@firestone-hs/hs-replay-xml-parser/dist/public-api';
import { AllCardsService } from '@firestone-hs/reference-data';
import { cardDrawn } from '../src/extractor/json-events/parsers/cards-draw-parser';
import { cardsInHand } from '../src/extractor/json-events/parsers/cards-in-hand-parser';
import { ReplayParser } from '../src/extractor/json-events/replay-parser';
import { replayString } from './replay.xml';

const runTest = async () => {
	const cards = new AllCardsService();
	await cards.initializeCardsDb();

	const replay: Replay = parseHsReplayString(replayString, cards);
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
	let cardsDrawn: any[] = [];
	parser.on('card-draw', (event) => {
		// console.debug('card drawn', event.cardId);
		cardsDrawn = [...cardsDrawn, { cardId: event.cardId, turn: event.turn }];
	});
	parser.parse();

	console.log(cardsAfterMulligan);
	console.log(cardsDrawn);
	console.log(cardsAfterMulligan.map((c) => cards.getCard(c.cardId).name));
	console.log(cardsDrawn.map((c) => ({ turn: c.turn, cardName: cards.getCard(c.cardId).name })));
};

runTest();
