import { bedrock } from '@ai-sdk/amazon-bedrock';

export type ChatModel = {
  id: string;
  name: string;
  description: string;
};

export const chatModels: ChatModel[] = [
  {
    id: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
    name: 'Claude Sonnet 4',
    description: 'Best balance of speed and intelligence',
  },
  {
    id: 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
    name: 'Claude 3.5 Haiku',
    description: 'Fastest responses',
  },
];

export const DEFAULT_CHAT_MODEL = chatModels[0].id;
export const TITLE_MODEL = 'us.anthropic.claude-3-5-haiku-20241022-v1:0';

export const allowedModelIds = new Set(chatModels.map((m) => m.id));

export function getChatModel(modelId: string = DEFAULT_CHAT_MODEL) {
  return bedrock(modelId);
}

export function getTitleModel() {
  return bedrock(TITLE_MODEL);
}
