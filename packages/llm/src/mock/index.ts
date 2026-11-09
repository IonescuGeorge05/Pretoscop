export { MockAnthropicServer, type MockBatchOutcome, type MockFailure, type MockReply, type MockResponder, type RecordedRequest } from './server';
export { heuristicPair, heuristicResponder, jsonBlocks, pairResponder, promptKindOf, type PromptKind, userText } from './responders';

/** The key the mock accepts (any non-empty value works); never a real credential. */
export const MOCK_API_KEY = 'mock-key-not-a-secret';
