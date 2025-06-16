import { getConnectionProxy, getPatchInfos, S3 } from '@firestone-hs/aws-lambda-utils';
import { Context } from 'aws-lambda';
import { gzipSync } from 'zlib';
import { ArenaDiscoveredCard } from './arena-discovered-cards';

const step = 5_000;
const waitTime = 200;
const timeout = 13 * 60 * 1000; // 13 minutes, to avoid timeout issues

// t3.large
// Upgrade to r6g.x8large to rebuild the table
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event, context: Context): Promise<any> => {
	const start = Date.now();
	const patchNumber = await getArenaPatch();
	const connection = await getConnectionProxy();
	const query = `
		SELECT playerClass, cardId, total
		FROM arena_discovered_cards
		WHERE buildNumber = ${patchNumber}
	`;
	console.log(new Date().toLocaleString(), 'running query', query);
	const result: any[] = await connection.query(query);
	connection.end();
	if (!result?.length) {
		console.log(new Date().toLocaleString(), 'no arena discovered cards found for patch', patchNumber);
		return { statusCode: 200, body: null };
	}

	const cards: ArenaDiscoveredCard[] = result.map((row) => ({
		buildNumber: patchNumber,
		playerClass: row.playerClass?.toUpperCase(),
		cardId: row.cardId,
		total: row.total,
	}));
	console.log(new Date().toLocaleString(), 'found', cards.length, 'arena discovered cards for patch', patchNumber);
	const cardStats = {
		lastUpdated: new Date().toISOString(),
		patch: patchNumber,
		cards: cards,
	};

	// Save as JSON file in S3
	const s3 = new S3();
	const gzippedResult = gzipSync(JSON.stringify(cardStats));
	await s3.writeFile(
		gzippedResult,
		'static.zerotoheroes.com',
		`api/arena/stats/discover/${patchNumber}.gz.json`,
		'application/json',
		'gzip',
	);
	await s3.writeFile(
		gzippedResult,
		'static.zerotoheroes.com',
		`api/arena/stats/discover/latest.gz.json`,
		'application/json',
		'gzip',
	);

	return { statusCode: 200, body: null };
};

const getArenaPatch = async (): Promise<number> => {
	const patchInfos = await getPatchInfos();
	const lastArenaPatchNumber = patchInfos.currentArenaMetaPatch;
	const arenaPatch = patchInfos.patches.find((p) => p.number === lastArenaPatchNumber && p.hasNewBuildNumber);
	if (arenaPatch) {
		return arenaPatch.number;
	}

	// Otherwise take the highest patch number that has a new build number and that is lower than the current one
	const lastPatch = patchInfos.patches
		.filter((p) => p.hasNewBuildNumber && p.number < lastArenaPatchNumber)
		.sort((a, b) => b.number - a.number)[0];
	if (lastPatch) {
		return lastPatch.number;
	}

	// If no patch found, return the current arena meta patch
	return lastArenaPatchNumber;
};
