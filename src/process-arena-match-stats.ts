import { S3, getConnection, logBeforeTimeout } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { handleArenaMessage } from './arena-message-handler';
import { ReviewMessage } from './model';

export const allCards = new AllCardsService();
export const s3 = new S3();

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event, context): Promise<any> => {
	const cleanup = logBeforeTimeout(context);
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
	const mysql = await getConnection();
	for (const message of messages) {
		await handleArenaMessage(message, mysql, allCards);
	}
	await mysql.end();
	cleanup();
	return { statusCode: 200, body: null };
};
