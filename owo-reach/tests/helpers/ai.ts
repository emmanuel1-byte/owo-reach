import { anthropicCreateMock, openAiCreateMock } from "../setup";

export { anthropicCreateMock, openAiCreateMock };

/** Reset the shared Anthropic SDK mock to an empty-beneficiaries default. Call in beforeEach. */
export function resetAnthropicMock(): void {
  anthropicCreateMock.mockReset();
  anthropicCreateMock.mockImplementation(async () => ({
    content: [{ type: "text", text: JSON.stringify({ beneficiaries: [] }) }],
  }));
}

/** Reset the shared OpenAI-compatible SDK mock to an empty-beneficiaries default. Call in beforeEach. */
export function resetOpenAiMock(): void {
  openAiCreateMock.mockReset();
  openAiCreateMock.mockImplementation(async () => ({
    choices: [{ message: { content: JSON.stringify({ beneficiaries: [] }) } }],
  }));
}
