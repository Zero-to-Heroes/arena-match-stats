import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { ReplayUploadMetadata } from '@firestone-hs/replay-metadata';
import { ServerlessMysql } from 'serverless-mysql';
import { ReviewMessage } from './model';

export const buildAllDiscoveredCards = (
	infos: { message: ReviewMessage; metadata: ReplayUploadMetadata }[],
	allCards: AllCardsService,
): ArenaDiscoveredCard[] => {
	const groupedByCard = groupByFunction(
		infos
			.flatMap((i) => [
				...(i.metadata.stats?.playerPlayedCardsByTurn ?? []),
				...(i.metadata.stats?.playerCastCardsByTurn ?? []),
				...(i.metadata.stats?.opponentPlayedCardsByTurn ?? []),
				...(i.metadata.stats?.opponentCastCardsByTurn ?? []),
			])
			.filter((c) => !!c?.createdBy),
		(card) => card.cardId,
	);
	return Object.values(groupedByCard).map((cards) => ({
		buildNumber: +infos[0].message.buildNumber,
		cardId: cards[0].cardId,
		// The context in which the card was discovered - can be useful if not all cards cannot be
		// discovered by all classes
		playerClass: infos[0].message.playerClass?.toUpperCase(),
		total: cards.length,
	}));
};

export const addArenaDiscoveredCards = async (
	mysql: ServerlessMysql,
	allDiscoveredCards: ArenaDiscoveredCard[],
): Promise<void> => {
	if (!allDiscoveredCards?.length) {
		return;
	}
	const start = Date.now();
	const values = allDiscoveredCards.map((card) => [card.buildNumber, card.playerClass, card.cardId, card.total]);
	const sql = `
        INSERT INTO arena_discovered_cards (buildNumber, playerClass, cardId, total)
        VALUES ?
        ON DUPLICATE KEY UPDATE total = total + VALUES(total)
    `;
	await mysql.query(sql, [values]);
	console.debug(`Added ${allDiscoveredCards.length} arena discovered cards in ${Date.now() - start} ms`);
};

export interface ArenaDiscoveredCard {
	readonly buildNumber: number;
	readonly cardId: string;
	readonly playerClass: string;
	readonly total: number;
}
