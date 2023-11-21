export const toTimestamp = (ts: string): Date => {
	const result = new Date();
	const split = ts.split(':');
	let hoursFromXml = parseInt(split[0]);
	if (hoursFromXml >= 24) {
		result.setDate(result.getDate() + 1);
		hoursFromXml -= 24;
	}
	result.setHours(hoursFromXml);
	result.setMinutes(parseInt(split[1]));
	result.setSeconds(parseInt(split[2].split('.')[0]));
	const milliseconds = parseInt(split[2].split('.')[1]) / 1000;
	result.setMilliseconds(milliseconds);
	return result;
};

export const normalizeHeroCardId = (heroCardId: string): string => {
	if (!heroCardId) {
		return heroCardId;
	}

	// Generic handling of BG hero skins, hoping they will keep the same pattern
	const bgHeroSkinMatch = heroCardId.match(/(.*)_SKIN_.*/);
	if (bgHeroSkinMatch) {
		return bgHeroSkinMatch.groups[1];
	}

	if (heroCardId === 'TB_BaconShop_HERO_59t') {
		return 'TB_BaconShop_HERO_59';
	}
	return heroCardId;
};
