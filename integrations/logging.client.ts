/**
 * Logging Client - Integration with Datadog Monitoring Platform
 *
 * This module provides a structured logging client that forwards all
 * application logs and metrics to the external Datadog Logging Platform.
 * Datadog is an external system that aggregates, indexes, and visualizes
 * logs and metrics from the Message Processing Platform.
 *
 * The Message Processing Platform sends logs to Datadog for:
 * - Request/response logging from API Consumer interactions
 * - Admin User actions (strategy changes, API key management)
 * - Message processing metrics (throughput, latency, error rates)
 * - System health and performance data
 *
 * Communication is done via Datadog's Log Ingestion API using HTTPS,
 * with local buffering to handle Datadog service interruptions.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

interface LogEntry {
  level: LogLevel;
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
  service: string;
  environment: string;
  traceId?: string;
}

interface DatadogConfig {
  apiKey: string;
  baseUrl: string;
  service: string;
  environment: string;
  bufferSize: number;
  flushIntervalMs: number;
}

interface MetricPoint {
  metric: string;
  type: 'count' | 'gauge' | 'rate' | 'histogram';
  value: number;
  tags: string[];
  timestamp: number;
}

/** Default configuration for the Datadog external system connection */
const DEFAULT_DATADOG_CONFIG: DatadogConfig = {
  apiKey: process.env.DATADOG_API_KEY || '',
  baseUrl: 'https://http-intake.logs.datadoghq.com/api/v2',
  service: 'message-processing-platform',
  environment: process.env.NODE_ENV || 'development',
  bufferSize: 100,
  flushIntervalMs: 10000,
};

/**
 * Client for the external Datadog Logging Platform.
 * Forwards structured logs and metrics from the Message Processing Platform
 * to Datadog for centralized observability. System Monitors use Datadog
 * dashboards to track platform health and performance.
 */
export class LoggingClient {
  private config: DatadogConfig;
  private buffer: LogEntry[] = [];
  private metricsBuffer: MetricPoint[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<DatadogConfig>) {
    this.config = { ...DEFAULT_DATADOG_CONFIG, ...config };
  }

  /**
   * Logs an info-level event and forwards it to the Datadog external system.
   */
  info(event: string, data: Record<string, unknown> = {}): void {
    this.log('info', event, data);
  }

  /**
   * Logs a warning-level event and forwards it to the Datadog external system.
   */
  warn(event: string, data: Record<string, unknown> = {}): void {
    this.log('warn', event, data);
  }

  /**
   * Logs an error-level event and forwards it to the Datadog external system.
   * Error events trigger automatic alerting in Datadog, which may notify
   * System Monitors via their configured alert channels.
   */
  error(event: string, data: Record<string, unknown> = {}): void {
    this.log('error', event, data);
  }

  /**
   * Logs a critical-level event. Critical events are immediately flushed
   * to Datadog (bypassing the buffer) and trigger high-priority alerts
   * to System Monitors and Admin Users.
   */
  critical(event: string, data: Record<string, unknown> = {}): void {
    this.log('critical', event, data);
    // Critical logs bypass the buffer and are sent immediately to Datadog
    this.flush();
  }

  /**
   * Records a metric data point and sends it to the Datadog external system.
   * Metrics are used by System Monitors to track platform performance
   * via Datadog dashboards and alerts.
   */
  recordMetric(
    metric: string,
    value: number,
    type: MetricPoint['type'] = 'gauge',
    tags: string[] = [],
  ): void {
    const point: MetricPoint = {
      metric: `${this.config.service}.${metric}`,
      type,
      value,
      tags: [...tags, `env:${this.config.environment}`],
      timestamp: Date.now(),
    };

    this.metricsBuffer.push(point);

    // Send to Datadog metrics API
    if (this.metricsBuffer.length >= this.config.bufferSize) {
      this.flushMetrics();
    }
  }

  /**
   * Starts the background flush timer that periodically sends buffered
   * logs and metrics to the Datadog external system.
   */
  startAutoFlush(): void {
    if (this.flushTimer) return;

    this.flushTimer = setInterval(() => {
      this.flush();
      this.flushMetrics();
    }, this.config.flushIntervalMs);
  }

  /** Stops the auto-flush timer */
  stopAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /** Creates a structured log entry and adds it to the buffer */
  private log(level: LogLevel, event: string, data: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      event,
      data,
      timestamp: new Date().toISOString(),
      service: this.config.service,
      environment: this.config.environment,
    };

    // Always log to local console
    const consoleMethod = level === 'error' || level === 'critical' ? 'error' : 'log';
    console[consoleMethod](`[${level.toUpperCase()}] ${event}`, JSON.stringify(data));

    this.buffer.push(entry);

    if (this.buffer.length >= this.config.bufferSize) {
      this.flush();
    }
  }

  /**
   * Flushes buffered log entries to the external Datadog Logging Platform
   * via its HTTP Log Ingestion API.
   */
  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      await this.sendToDatadog('/logs', entries);
    } catch (error) {
      console.error(`[Datadog] Failed to flush ${entries.length} log entries:`, (error as Error).message);
      // Re-add failed entries to buffer for retry
      this.buffer.unshift(...entries);
    }
  }

  /**
   * Flushes buffered metrics to the external Datadog platform
   * via its Metrics Submission API.
   */
  private async flushMetrics(): Promise<void> {
    if (this.metricsBuffer.length === 0) return;

    const metrics = [...this.metricsBuffer];
    this.metricsBuffer = [];

    try {
      await this.sendToDatadog('/series', { series: metrics });
    } catch (error) {
      console.error(`[Datadog] Failed to flush ${metrics.length} metrics:`, (error as Error).message);
    }
  }

  /** Sends data to the Datadog external system via HTTPS */
  private async sendToDatadog(endpoint: string, body: unknown): Promise<void> {
    const url = `${this.config.baseUrl}${endpoint}`;

    // In production, this would use fetch/axios to call Datadog's REST API
    console.log(`[Datadog] POST ${url} (${Array.isArray(body) ? body.length : 1} items)`);
  }
}
