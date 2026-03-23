import { z } from 'zod';

const partSchema = z.object({
  type: z.string(),
}).passthrough();

const messageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  parts: z.array(partSchema),
}).passthrough();

export const postRequestBodySchema = z.object({
  id: z.string(),
  messages: z.array(messageSchema),
  selectedChatModel: z.string().optional(),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
