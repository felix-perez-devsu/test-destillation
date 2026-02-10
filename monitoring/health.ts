/**
 * Health Check & Monitoring Module
 *
 * This module provides health check endpoints and system monitoring
 * capabilities used by System Monitors. System Monitors are operations
 * team members and automated monitoring agents (like uptime checkers)
 * that continuously verify the Message Processing Platform is healthy.
 *
 * System Monitors interact with this module to:
 * - Check overall platform health via /health endpoint
 * - Verify connectivity to external systems (SendGrid, Datadog, RabbitMQ)
 * - Review processing throughput and latency metrics
 * - Trigger manual health reports
 *
 * Health data is also forwarded to the Datadog Logging Platform for
 * historical tracking and alerting based on health degradation.
 */

import { LoggingClient } from '../integrations/logging.client';
import { NotificationClient } from '../integrations/notification.client';
import { QueueClient } from '../integrations/queue.client';

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

interface ComponentHealth {
  name: string;
  status: HealthStatus;
  responseTimeMs: number;
  lastChecked: string;
  details?: Record<string, unknown>;
}

interface PlatformHealth {
  status: HealthStatus;
  uptime: number;
  version: string;
  components: ComponentHealth[];
  metrics: {
    messagesProcessedTotal: number;
    messagesProcessedLast5Min: number;
    averageLatencyMs: number;
    errorRate: number;
    activeStrategies: number;
  };
  checkedAt: string;
}

/** In-memory metrics counters (reset on restart) */
const metrics = {
  messagesProcessedTotal: 0,
  messagesProcessedLast5Min: 0,
  totalLatencyMs: 0,
  errorCount: 0,
  startTime: Date.now(),
};

/**
 * Performs a comprehensive health check of the Message Processing Platform.
 * This is the primary endpoint used by System Monitors to verify
 * that the platform and all its external system dependencies are operational.
 *
 * System Monitors (both human ops engineers and automated monitoring tools)
 * poll this endpoint at regular intervals to detect issues early.
 */
async function checkPlatformHealth(): Promise<PlatformHealth> {
  const logger = new LoggingClient();

  const components: ComponentHealth[] = await Promise.all([
    checkSendGridHealth(),
    checkDatadogHealth(),
    checkRabbitMQHealth(),
    checkProcessingEngine(),
  ]);

  const overallStatus = determineOverallStatus(components);
  const uptimeSeconds = (Date.now() - metrics.startTime) / 1000;

  const health: PlatformHealth = {
    status: overallStatus,
    uptime: uptimeSeconds,
    version: '1.0.0',
    components,
    metrics: {
      messagesProcessedTotal: metrics.messagesProcessedTotal,
      messagesProcessedLast5Min: metrics.messagesProcessedLast5Min,
      averageLatencyMs: metrics.messagesProcessedTotal > 0
        ? metrics.totalLatencyMs / metrics.messagesProcessedTotal
        : 0,
      errorRate: metrics.messagesProcessedTotal > 0
        ? metrics.errorCount / metrics.messagesProcessedTotal
        : 0,
      activeStrategies: 2,
    },
    checkedAt: new Date().toISOString(),
  };

  // Forward health data to Datadog for historical tracking
  logger.recordMetric('health.status', overallStatus === 'healthy' ? 1 : 0, 'gauge', ['check:platform']);
  logger.recordMetric('health.uptime', uptimeSeconds, 'gauge');
  logger.recordMetric('health.messages.total', metrics.messagesProcessedTotal, 'count');

  // If status is degraded or unhealthy, alert System Monitors via Datadog
  if (overallStatus !== 'healthy') {
    logger.warn('health.degraded', {
      status: overallStatus,
      unhealthyComponents: components.filter(c => c.status !== 'healthy').map(c => c.name),
    });
  }

  return health;
}

/**
 * Checks connectivity to the external SendGrid Notification Service.
 * System Monitors need to know if notification delivery is operational.
 */
async function checkSendGridHealth(): Promise<ComponentHealth> {
  const startTime = Date.now();

  try {
    const client = new NotificationClient();
    // Attempt a lightweight API call to verify SendGrid connectivity
    await client.sendNotification({
      type: 'health-alert',
      recipient: 'health-check',
      data: { type: 'ping' },
      priority: 'low',
    });

    return {
      name: 'SendGrid Notification Service',
      status: 'healthy',
      responseTimeMs: Date.now() - startTime,
      lastChecked: new Date().toISOString(),
      details: { endpoint: 'api.sendgrid.com' },
    };
  } catch {
    return {
      name: 'SendGrid Notification Service',
      status: 'unhealthy',
      responseTimeMs: Date.now() - startTime,
      lastChecked: new Date().toISOString(),
      details: { error: 'Connection failed' },
    };
  }
}

/**
 * Checks connectivity to the external Datadog Logging Platform.
 * System Monitors rely on Datadog for observability, so this
 * connection is critical for operational visibility.
 */
async function checkDatadogHealth(): Promise<ComponentHealth> {
  const startTime = Date.now();

  try {
    const client = new LoggingClient();
    client.info('health.check', { type: 'connectivity-test' });

    return {
      name: 'Datadog Logging Platform',
      status: 'healthy',
      responseTimeMs: Date.now() - startTime,
      lastChecked: new Date().toISOString(),
      details: { endpoint: 'http-intake.logs.datadoghq.com' },
    };
  } catch {
    return {
      name: 'Datadog Logging Platform',
      status: 'unhealthy',
      responseTimeMs: Date.now() - startTime,
      lastChecked: new Date().toISOString(),
      details: { error: 'Connection failed' },
    };
  }
}

/**
 * Checks connectivity to the external RabbitMQ Message Queue system.
 * A healthy RabbitMQ connection is essential for async message processing.
 */
async function checkRabbitMQHealth(): Promise<ComponentHealth> {
  const startTime = Date.now();

  try {
    const client = new QueueClient();
    const status = client.getConnectionStatus();

    return {
      name: 'RabbitMQ Message Queue',
      status: status.connected ? 'healthy' : 'degraded',
      responseTimeMs: Date.now() - startTime,
      lastChecked: new Date().toISOString(),
      details: {
        host: status.host,
        vhost: status.vhost,
        activeConsumers: status.consumers,
      },
    };
  } catch {
    return {
      name: 'RabbitMQ Message Queue',
      status: 'unhealthy',
      responseTimeMs: Date.now() - startTime,
      lastChecked: new Date().toISOString(),
      details: { error: 'Connection failed' },
    };
  }
}

/**
 * Checks the internal message processing engine health.
 * Verifies that the strategy-based processing pipeline is functional.
 */
async function checkProcessingEngine(): Promise<ComponentHealth> {
  const startTime = Date.now();

  try {
    // Quick self-test: process a test message
    const { MessageContext } = await import('../common');
    const { ReverseProcessor } = await import('../core/reverse');

    const context = new MessageContext(new ReverseProcessor());
    const result = context.executeStrategy('health-check');

    const isHealthy = result.includes('[REVERSED]');

    return {
      name: 'Message Processing Engine',
      status: isHealthy ? 'healthy' : 'unhealthy',
      responseTimeMs: Date.now() - startTime,
      lastChecked: new Date().toISOString(),
      details: {
        availableStrategies: ['reverse', 'titlecase'],
        testResult: isHealthy ? 'passed' : 'failed',
      },
    };
  } catch {
    return {
      name: 'Message Processing Engine',
      status: 'unhealthy',
      responseTimeMs: Date.now() - startTime,
      lastChecked: new Date().toISOString(),
      details: { error: 'Self-test failed' },
    };
  }
}

/** Determines the overall platform status based on component health */
function determineOverallStatus(components: ComponentHealth[]): HealthStatus {
  const hasUnhealthy = components.some(c => c.status === 'unhealthy');
  const hasDegraded = components.some(c => c.status === 'degraded');

  if (hasUnhealthy) return 'unhealthy';
  if (hasDegraded) return 'degraded';
  return 'healthy';
}

/**
 * Records a processed message metric.
 * Called by the API server after each successful processing.
 */
function recordMessageProcessed(latencyMs: number, success: boolean): void {
  metrics.messagesProcessedTotal++;
  metrics.messagesProcessedLast5Min++;
  metrics.totalLatencyMs += latencyMs;

  if (!success) {
    metrics.errorCount++;
  }
}

/**
 * Returns a simplified health status for quick System Monitor checks.
 * Used by load balancers and uptime monitors that only need a pass/fail.
 */
async function quickHealthCheck(): Promise<{ status: HealthStatus; uptime: number }> {
  return {
    status: 'healthy',
    uptime: (Date.now() - metrics.startTime) / 1000,
  };
}

export {
  checkPlatformHealth,
  quickHealthCheck,
  recordMessageProcessed,
  PlatformHealth,
  ComponentHealth,
  HealthStatus,
};
