import { getConnectionProxy, S3 } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { addArenaDiscoveredCards, ArenaDiscoveredCard, buildAllDiscoveredCards } from './arena-discovered-cards';
import { addArenaMatchStat, isMessageValid, loadMetaDataFile } from './arena-message-handler';
import { ReviewMessage } from './model';

export const allCards = new AllCardsService();
export const s3 = new S3();

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event, context): Promise<any> => {
	const messages: readonly ReviewMessage[] = (event.Records as any[])
		.map((event) => JSON.parse(event.body))
		.reduce((a, b) => a.concat(b), [])
		.filter((event) => event)
		.map((event) => event.Message)
		.filter((msg) => msg)
		.map((msg) => JSON.parse(msg));
	if (!allCards.getCards()?.length) {
		await allCards.initializeCardsDb();
	}

	const validMessages = messages.filter((message) => isMessageValid(message));
	console.log('processing', validMessages.length, 'messages');

	const infos = await Promise.all(validMessages.map((message) => loadMetaDataFile(message)));
	const validInfos = infos.filter((info) => info.metadata);

	const allDiscoveredCards: ArenaDiscoveredCard[] = buildAllDiscoveredCards(validInfos, allCards);

	const mysql = await getConnectionProxy();
	for (const info of validInfos) {
		await addArenaMatchStat(mysql, info.message, info.metadata, allCards);
	}
	await addArenaDiscoveredCards(mysql, allDiscoveredCards);
	await mysql.end();

	return { statusCode: 200, body: null };
};
