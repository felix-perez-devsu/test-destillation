/**
 * Queue Client - Integration with RabbitMQ Message Queue System
 *
 * This module provides a client for communicating with the external
 * RabbitMQ Message Queue system. RabbitMQ is an external system that
 * provides asynchronous message passing between the Message Processing
 * Platform and downstream consumers/services.
 *
 * The Message Processing Platform publishes to RabbitMQ when:
 * - A message has been successfully processed (for async delivery)
 * - Batch processing jobs need to be distributed across workers
 * - Dead-letter handling is needed for failed processing attempts
 *
 * The Message Processing Platform consumes from RabbitMQ when:
 * - Incoming messages arrive from upstream producers
 * - Retry queues deliver previously failed messages
 *
 * Communication uses AMQP protocol over TCP to the RabbitMQ cluster.
 */

interface QueueMessage {
  id: string;
  routingKey: string;
  payload: Record<string, unknown>;
  headers: Record<string, string>;
  timestamp: string;
  retryCount: number;
}

interface QueueConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  vhost: string;
  exchange: string;
  prefetchCount: number;
  heartbeat: number;
}

type MessageHandler = (message: QueueMessage) => Promise<void>;

/** Default configuration for the RabbitMQ external system connection */
const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  host: process.env.RABBITMQ_HOST || 'localhost',
  port: parseInt(process.env.RABBITMQ_PORT || '5672'),
  username: process.env.RABBITMQ_USER || 'guest',
  password: process.env.RABBITMQ_PASS || 'guest',
  vhost: '/message-processing',
  exchange: 'message-processing-exchange',
  prefetchCount: 10,
  heartbeat: 60,
};

/** Queue definitions for the Message Processing Platform */
const QUEUE_DEFINITIONS = {
  /** Queue for incoming messages from external producers */
  INCOMING_MESSAGES: 'mp.incoming.messages',
  /** Queue for successfully processed results */
  PROCESSED_RESULTS: 'mp.processed.results',
  /** Queue for failed messages that need retry */
  DEAD_LETTER: 'mp.dead-letter',
  /** Queue for batch processing jobs */
  BATCH_JOBS: 'mp.batch.jobs',
  /** Queue for notification triggers */
  NOTIFICATIONS: 'mp.notifications',
} as const;

/**
 * Client for the external RabbitMQ Message Queue system.
 * Manages all asynchronous communication between the Message Processing
 * Platform and external consumers/producers via AMQP protocol.
 */
export class QueueClient {
  private config: QueueConfig;
  private isConnected: boolean = false;
  private consumers: Map<string, MessageHandler> = new Map();

  constructor(config?: Partial<QueueConfig>) {
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
  }

  /**
   * Publishes a message to the external RabbitMQ system.
   * This creates an outbound interaction from the Message Processing Platform
   * to the RabbitMQ Message Queue via AMQP protocol.
   *
   * @param routingKey - The routing key for message delivery
   * @param payload - The message payload to publish
   */
  async publish(routingKey: string, payload: Record<string, unknown>): Promise<string> {
    await this.ensureConnection();

    const message: QueueMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`,
      routingKey,
      payload,
      headers: {
        'x-source': 'message-processing-platform',
        'x-published-at': new Date().toISOString(),
        'content-type': 'application/json',
      },
      timestamp: new Date().toISOString(),
      retryCount: 0,
    };

    // Publish to RabbitMQ exchange via AMQP
    console.log(`[RabbitMQ] Publishing to ${this.config.exchange}/${routingKey}:`, message.id);

    return message.id;
  }

  /**
   * Subscribes to a queue on the external RabbitMQ system.
   * This creates an inbound interaction where the Message Processing Platform
   * consumes messages from RabbitMQ via AMQP protocol.
   *
   * @param queueName - The queue to consume from
   * @param handler - Callback function to process received messages
   */
  async subscribe(queueName: string, handler: MessageHandler): Promise<void> {
    await this.ensureConnection();

    this.consumers.set(queueName, handler);

    console.log(`[RabbitMQ] Subscribed to queue: ${queueName}`);
  }

  /**
   * Publishes a message to the dead-letter queue on RabbitMQ
   * when processing fails after all retry attempts.
   */
  async publishToDeadLetter(
    originalMessage: QueueMessage,
    error: Error,
  ): Promise<void> {
    await this.publish(QUEUE_DEFINITIONS.DEAD_LETTER, {
      originalMessage,
      error: {
        message: error.message,
        stack: error.stack,
      },
      failedAt: new Date().toISOString(),
    });
  }

  /**
   * Publishes a batch processing job to the RabbitMQ system
   * for distribution across processing workers.
   */
  async publishBatchJob(
    messages: string[],
    strategy: string,
  ): Promise<string> {
    const jobId = `batch-${Date.now()}`;

    await this.publish(QUEUE_DEFINITIONS.BATCH_JOBS, {
      jobId,
      messages,
      strategy,
      totalMessages: messages.length,
      submittedAt: new Date().toISOString(),
    });

    return jobId;
  }

  /**
   * Sets up all queue bindings and exchange configurations
   * on the RabbitMQ external system. Called during platform initialization.
   */
  async setupQueues(): Promise<void> {
    await this.ensureConnection();

    // Declare exchange on RabbitMQ
    console.log(`[RabbitMQ] Declaring exchange: ${this.config.exchange}`);

    // Declare and bind all queues
    for (const [name, queue] of Object.entries(QUEUE_DEFINITIONS)) {
      console.log(`[RabbitMQ] Declaring queue: ${queue}`);
      // In production: channel.assertQueue(queue, { durable: true })
      // In production: channel.bindQueue(queue, this.config.exchange, queue)
    }
  }

  /** Gets the current connection status with the RabbitMQ external system */
  getConnectionStatus(): { connected: boolean; host: string; vhost: string; consumers: number } {
    return {
      connected: this.isConnected,
      host: `${this.config.host}:${this.config.port}`,
      vhost: this.config.vhost,
      consumers: this.consumers.size,
    };
  }

  /**
   * Establishes connection to the external RabbitMQ system via AMQP protocol.
   * The connection includes heartbeat monitoring to detect RabbitMQ outages.
   */
  private async ensureConnection(): Promise<void> {
    if (this.isConnected) return;

    const connectionUrl = `amqp://${this.config.username}:****@${this.config.host}:${this.config.port}${this.config.vhost}`;

    console.log(`[RabbitMQ] Connecting to ${this.config.host}:${this.config.port}${this.config.vhost}`);

    // In production: amqplib.connect(connectionUrl)
    this.isConnected = true;

    console.log('[RabbitMQ] Connected successfully');
  }

  /** Closes the connection to the RabbitMQ external system */
  async disconnect(): Promise<void> {
    if (!this.isConnected) return;

    this.consumers.clear();
    this.isConnected = false;

    console.log('[RabbitMQ] Disconnected');
  }
}

export { QUEUE_DEFINITIONS, QueueMessage };
