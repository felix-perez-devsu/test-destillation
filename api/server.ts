/**
 * HTTP API Server for the Message Processing Platform
 *
 * This server exposes REST endpoints that allow external API Consumers
 * to submit messages for processing using the configured strategies.
 * API Consumers authenticate via API keys and send messages through
 * POST requests to the /api/messages endpoint.
 *
 * The server acts as the main entry point for all external integrations
 * and third-party applications that need message processing capabilities.
 */

import http from 'http';
import { MessageContext, MessageProcessor } from '../common';
import { ReverseProcessor } from '../core/reverse';
import { TitleCaseProcessor } from '../core/titlecase';
import { validateMessage } from '../common/message.validator';
import { NotificationClient } from '../integrations/notification.client';
import { LoggingClient } from '../integrations/logging.client';
import { QueueClient } from '../integrations/queue.client';

/** API key store for authenticating API Consumer users */
const API_KEYS = new Map<string, { clientName: string; tier: string }>([
  ['key-001', { clientName: 'Mobile App', tier: 'premium' }],
  ['key-002', { clientName: 'Partner Integration', tier: 'standard' }],
  ['key-003', { clientName: 'Internal Dashboard', tier: 'internal' }],
]);

/** Available processing strategies */
const strategies: Record<string, MessageProcessor> = {
  reverse: new ReverseProcessor(),
  titlecase: new TitleCaseProcessor(),
};

interface ProcessMessageRequest {
  message: string;
  strategy: string;
  notifyOnComplete?: boolean;
  callbackUrl?: string;
}

interface ProcessMessageResponse {
  success: boolean;
  result?: string;
  strategy: string;
  processedAt: string;
  requestId: string;
}

/**
 * Authenticates an incoming request from an API Consumer.
 * API Consumers are external users (developers, applications, services)
 * that interact with the Message Processing Platform via HTTP.
 */
function authenticateApiConsumer(apiKey: string): { clientName: string; tier: string } | null {
  return API_KEYS.get(apiKey) || null;
}

/**
 * Processes an incoming message request from an API Consumer.
 * Delegates to the appropriate strategy, publishes results to the
 * Message Queue system (RabbitMQ), and optionally sends notifications
 * through the Notification Service (SendGrid).
 */
async function handleProcessMessage(
  req: ProcessMessageRequest,
  clientName: string,
): Promise<ProcessMessageResponse> {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const logger = new LoggingClient();
  const queue = new QueueClient();

  logger.info('message.received', {
    requestId,
    clientName,
    strategy: req.strategy,
    messageLength: req.message.length,
  });

  // Validate the incoming message
  validateMessage(req.message);

  // Select and execute the processing strategy
  const processor = strategies[req.strategy];
  if (!processor) {
    throw new Error(`Unknown strategy: ${req.strategy}. Available: ${Object.keys(strategies).join(', ')}`);
  }

  const context = new MessageContext(processor);
  const result = context.executeStrategy(req.message);

  // Publish the processed result to the Message Queue (RabbitMQ) for async consumers
  await queue.publish('message.processed', {
    requestId,
    originalMessage: req.message,
    processedMessage: result,
    strategy: req.strategy,
    timestamp: new Date().toISOString(),
  });

  // If the API Consumer requested notification on completion,
  // send it through the Notification Service (SendGrid)
  if (req.notifyOnComplete) {
    const notifier = new NotificationClient();
    await notifier.sendNotification({
      type: 'processing-complete',
      recipient: clientName,
      data: {
        requestId,
        strategy: req.strategy,
        resultPreview: result.substring(0, 100),
      },
    });
  }

  logger.info('message.processed', {
    requestId,
    clientName,
    strategy: req.strategy,
    resultLength: result.length,
  });

  return {
    success: true,
    result,
    strategy: req.strategy,
    processedAt: new Date().toISOString(),
    requestId,
  };
}

/**
 * Creates and starts the HTTP server.
 * This is the primary interface through which API Consumers
 * interact with the Message Processing Platform.
 */
function createServer(port: number = 3000): http.Server {
  const server = http.createServer(async (req, res) => {
    const logger = new LoggingClient();

    // CORS headers for API Consumer applications
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

    if (req.method === 'POST' && req.url === '/api/messages') {
      const apiKey = req.headers['x-api-key'] as string;
      const consumer = authenticateApiConsumer(apiKey);

      if (!consumer) {
        logger.warn('auth.failed', { apiKey: apiKey?.substring(0, 8) });
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid API key' }));
        return;
      }

      try {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
        }

        const request: ProcessMessageRequest = JSON.parse(body);
        const response = await handleProcessMessage(request, consumer.clientName);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (error) {
        logger.error('message.processing.failed', { error: (error as Error).message });
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (error as Error).message }));
      }
    } else if (req.method === 'GET' && req.url === '/api/strategies') {
      // Endpoint for API Consumers to list available strategies
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        strategies: Object.keys(strategies),
        default: 'reverse',
      }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  server.listen(port, () => {
    console.log(`Message Processing API server running on port ${port}`);
    console.log('Accepting requests from authenticated API Consumers');
  });

  return server;
}

export { createServer, handleProcessMessage, authenticateApiConsumer };
