export interface ArenaDiscoveredCard {
	readonly buildNumber: number;
	readonly cardId: string;
	// The context in which the card was discovered - can be useful if not all cards cannot be
	// discovered by all classes
	readonly playerClass: string;
	readonly total: number;
}
