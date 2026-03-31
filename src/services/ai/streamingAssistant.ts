/**
 * Becca AI v2 — Streaming Assistant Service
 *
 * Orchestrates OpenAI streaming with tool-calling for the Becca AI chat.
 * Replaces the monolithic assistantService.ts for the v2 streaming path.
 */

import OpenAI from 'openai';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { allToolDefinitions, routeToolCall } from './tools';
import {
  BECCA_V2_SYSTEM_PROMPT,
  BECCA_V2_MODEL,
  BECCA_V2_TEMPERATURE,
  BECCA_V2_MAX_TOKENS,
} from './beccaSystemPrompt';

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    _client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      organization: process.env.OPENAI_ORG_ID,
      maxRetries: 2,
      timeout: 60_000,
    });
  }
  return _client;
}

export interface StreamContext {
  query: string;
  userEmail: string;
  clinicId: number;
  sessionId?: string;
  patientId?: number;
}

interface SSEWriter {
  write(event: string, data: unknown): void;
  close(): void;
}

/**
 * Run the streaming assistant loop.
 *
 * Writes SSE events to the writer as they arrive:
 *   - text_delta: { content: string }
 *   - tool_call_start: { name: string, description: string }
 *   - tool_call_result: { name: string, summary: string }
 *   - suggestions: { suggestions: string[] }
 *   - done: { sessionId, messageId, usage }
 *   - error: { message: string }
 */
export async function runStreamingAssistant(
  ctx: StreamContext,
  writer: SSEWriter,
): Promise<void> {
  const startMs = Date.now();
  let firstTokenMs: number | null = null;
  let toolCallsCount = 0;

  const model = process.env.OPENAI_MODEL || BECCA_V2_MODEL;
  const client = getClient();

  // Resolve or create conversation
  const conversation = await resolveConversation(ctx);

  // Store user message
  await prisma.aIMessage.create({
    data: {
      conversationId: conversation.id,
      role: 'user',
      content: ctx.query,
    },
  });

  // Build messages array
  const messages = buildMessages(ctx, conversation);

  // Streaming tool-calling loop (max 5 iterations to prevent infinite loops)
  let fullContent = '';
  const MAX_TOOL_ROUNDS = 5;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = await client.chat.completions.create({
      model,
      messages,
      tools: allToolDefinitions,
      temperature: BECCA_V2_TEMPERATURE,
      max_completion_tokens: BECCA_V2_MAX_TOKENS,
      stream: true,
    });

    let currentToolCalls: Map<number, { id: string; name: string; args: string }> = new Map();
    let finishReason: string | null = null;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      finishReason = chunk.choices[0]?.finish_reason ?? finishReason;

      // Text content
      if (delta?.content) {
        if (firstTokenMs === null) firstTokenMs = Date.now() - startMs;
        fullContent += delta.content;
        writer.write('text_delta', { content: delta.content });
      }

      // Tool call deltas — accumulate arguments
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!currentToolCalls.has(idx)) {
            currentToolCalls.set(idx, { id: tc.id ?? '', name: tc.function?.name ?? '', args: '' });
          }
          const entry = currentToolCalls.get(idx)!;
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name = tc.function.name;
          if (tc.function?.arguments) entry.args += tc.function.arguments;
        }
      }
    }

    // If model finished with content (no tool calls), we're done
    if (finishReason !== 'tool_calls' || currentToolCalls.size === 0) {
      break;
    }

    // Execute tool calls
    const toolCallResults: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    // Add the assistant message with tool calls to the history
    messages.push({
      role: 'assistant',
      content: fullContent || null,
      tool_calls: Array.from(currentToolCalls.values()).map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.args },
      })),
    });

    // Emit all tool_call_start events immediately
    const toolCallEntries = Array.from(currentToolCalls.values());
    for (const tc of toolCallEntries) {
      toolCallsCount++;
      writer.write('tool_call_start', { name: tc.name, description: getToolDescription(tc.name) });
    }

    // Execute all tool calls in parallel for faster response
    const results = await Promise.all(
      toolCallEntries.map(async (tc) => {
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(tc.args);
        } catch {
          args = {};
        }
        const result = await routeToolCall(tc.name, args, ctx.clinicId);
        return { tc, result };
      }),
    );

    // Emit results and build response messages
    for (const { tc, result } of results) {
      writer.write('tool_call_result', {
        name: tc.name,
        summary: summarizeToolResult(tc.name, result),
      });
      toolCallResults.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: result,
      });
    }

    messages.push(...toolCallResults);
    // Reset for next round — the model will process tool results and either respond or call more tools
    fullContent = '';
  }

  // Extract suggestions from the response
  const suggestions = extractSuggestions(fullContent);
  if (suggestions.length > 0) {
    writer.write('suggestions', { suggestions });
    // Strip the suggestion tag from stored content
    fullContent = fullContent.replace(/<!--suggestions:\[.*?\]-->/s, '').trim();
  }

  // Persist assistant response
  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const assistantMessage = await prisma.aIMessage.create({
    data: {
      conversationId: conversation.id,
      role: 'assistant',
      content: fullContent,
      queryType: 'streaming_v2',
      toolCallsCount,
      firstTokenMs,
      model,
      responseTimeMs: Date.now() - startMs,
    },
  });

  await prisma.aIConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  // Auto-summarize every 10 messages for long-context memory
  const messageCount = (conversation.messages?.length ?? 0) + 2; // +2 for new user+assistant
  if (messageCount >= 10 && messageCount % 10 < 2) {
    summarizeConversation(conversation.id, client, model).catch((err) =>
      logger.warn('[BeccaV2] Background summarization failed', { error: String(err) }),
    );
  }

  writer.write('done', {
    sessionId: conversation.sessionId,
    messageId: assistantMessage.id,
    usage,
    toolCallsCount,
    responseTimeMs: Date.now() - startMs,
  });
  writer.close();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveConversation(ctx: StreamContext) {
  if (ctx.sessionId) {
    const existing = await prisma.aIConversation.findFirst({
      where: { sessionId: ctx.sessionId, clinicId: ctx.clinicId },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    if (existing) return existing;
  }

  const newSessionId =
    ctx.sessionId || `becca-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  return prisma.aIConversation.create({
    data: {
      sessionId: newSessionId,
      userEmail: ctx.userEmail,
      clinicId: ctx.clinicId,
      patientId: ctx.patientId,
      isActive: true,
    },
    include: { messages: true },
  });
}

function buildMessages(
  ctx: StreamContext,
  conversation: { messages: Array<{ role: string; content: string }>; summary?: string | null },
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  // System prompt
  let systemContent = BECCA_V2_SYSTEM_PROMPT;
  if (ctx.patientId) {
    systemContent += `\n\nCURRENT PATIENT CONTEXT: The user is viewing patient ID ${ctx.patientId}. Use get_patient_details to fetch their info when relevant.`;
  }
  if (conversation.summary) {
    systemContent += `\n\nCONVERSATION SUMMARY (previous messages):\n${conversation.summary}`;
  }
  msgs.push({ role: 'system', content: systemContent });

  // Recent conversation history (last 10 user/assistant messages)
  const history = [...conversation.messages].reverse().slice(0, 10);
  for (const msg of history) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      msgs.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
    }
  }

  // Current query
  msgs.push({ role: 'user', content: ctx.query });

  return msgs;
}

function getToolDescription(name: string): string {
  const descriptions: Record<string, string> = {
    search_patients: 'Searching for patients...',
    get_patient_details: 'Looking up patient details...',
    get_patient_orders: 'Checking orders...',
    get_patient_prescriptions: 'Reviewing prescriptions...',
    get_soap_notes: 'Reading SOAP notes...',
    get_tracking_info: 'Checking shipment tracking...',
    get_clinic_statistics: 'Pulling clinic statistics...',
    lookup_medication: 'Looking up medication info...',
    get_sig_template: 'Fetching prescription template...',
  };
  return descriptions[name] || `Running ${name}...`;
}

function summarizeToolResult(name: string, rawJson: string): string {
  try {
    const data = JSON.parse(rawJson);
    if (data.error) return `Error: ${data.error}`;
    if (data.found === false) return data.message || 'Not found';

    switch (name) {
      case 'search_patients':
        return data.count ? `Found ${data.count} patient(s)` : 'No matches';
      case 'get_patient_details':
        return data.patient ? `Loaded ${data.patient.name}` : 'Not found';
      case 'get_patient_orders':
        return `${data.count ?? 0} order(s)`;
      case 'get_patient_prescriptions':
        return `${data.count ?? 0} prescription(s)`;
      case 'get_soap_notes':
        return `${data.count ?? 0} SOAP note(s)`;
      case 'get_tracking_info':
        return `${data.orders?.length ?? 0} tracked shipment(s)`;
      case 'get_clinic_statistics':
        return `${data.totalPatients ?? 0} patients, ${data.totalOrders ?? 0} orders`;
      case 'lookup_medication':
        return 'Medication info loaded';
      case 'get_sig_template':
        return 'SIG template loaded';
      default:
        return 'Done';
    }
  } catch {
    return 'Done';
  }
}

function extractSuggestions(content: string): string[] {
  const match = content.match(/<!--suggestions:(\[.*?\])-->/s);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[1]);
    return Array.isArray(arr) ? arr.slice(0, 3) : [];
  } catch {
    return [];
  }
}

/**
 * Generate a summary of the conversation so far and persist it.
 * Runs in the background — failures are non-critical.
 */
async function summarizeConversation(
  conversationId: number,
  client: OpenAI,
  model: string,
): Promise<void> {
  const messages = await prisma.aIMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true },
  });

  if (messages.length < 6) return;

  const transcript = messages
    .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
    .join('\n');

  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content:
          'Summarize the following clinical assistant conversation in 3-5 sentences. Focus on: which patients were discussed, what data was looked up, what clinical topics were covered, and any outstanding questions. Be factual and concise.',
      },
      { role: 'user', content: transcript },
    ],
    temperature: 0.2,
    max_completion_tokens: 300,
  });

  const summary = completion.choices[0]?.message?.content?.trim();
  if (summary) {
    await prisma.aIConversation.update({
      where: { id: conversationId },
      data: { summary },
    });
    logger.info('[BeccaV2] Conversation summarized', { conversationId, summaryLength: summary.length });
  }
}
