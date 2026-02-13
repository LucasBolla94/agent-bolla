import { PersonalityStore } from './store.js';
import { PersonalityService } from './service.js';

export { PersonalityService } from './service.js';
export { PersonalityStore } from './store.js';
export * from './types.js';
export { DEFAULT_PERSONALITY } from './defaults.js';

/**
 * Factory: create and return a fully loaded PersonalityService.
 * Seeds defaults on first run, loads all traits from the DB.
 *
 * @example
 * const personality = await createPersonalityService();
 * const systemPrompt = personality.buildSystemPrompt();
 * await personality.set('humor_atual', 'Sarcástico e bem-humorado');
 */
export const createPersonalityService = async (): Promise<PersonalityService> => {
  const store = new PersonalityStore();
  const service = new PersonalityService(store);
  await service.load();
  return service;
};
