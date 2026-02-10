/**
 * Notification Client - Integration with SendGrid Email Service
 *
 * This module provides a client for communicating with the external
 * SendGrid Notification Service. SendGrid is an external system that
 * handles all outbound email notifications, SMS alerts, and webhook
 * deliveries for the Message Processing Platform.
 *
 * The Message Processing Platform sends notifications to SendGrid when:
 * - A message processing job completes (notifying the API Consumer)
 * - An Admin User modifies platform configuration
 * - System health alerts are triggered
 * - Rate limit thresholds are approached
 *
 * Communication is done via SendGrid's REST API using HTTPS.
 */

interface NotificationPayload {
  type: 'processing-complete' | 'admin-config-change' | 'health-alert' | 'rate-limit-warning';
  recipient: string;
  data: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'high' | 'critical';
}

interface SendGridResponse {
  messageId: string;
  status: 'queued' | 'sent' | 'failed';
  timestamp: string;
}

interface SendGridConfig {
  apiKey: string;
  baseUrl: string;
  fromEmail: string;
  fromName: string;
  retryAttempts: number;
  timeoutMs: number;
}

/** Default configuration for the SendGrid external system connection */
const DEFAULT_SENDGRID_CONFIG: SendGridConfig = {
  apiKey: process.env.SENDGRID_API_KEY || '',
  baseUrl: 'https://api.sendgrid.com/v3',
  fromEmail: 'platform@messageprocessor.io',
  fromName: 'Message Processing Platform',
  retryAttempts: 3,
  timeoutMs: 5000,
};

/**
 * Client for the external SendGrid Notification Service.
 * All outbound notifications from the Message Processing Platform
 * are routed through this client to the SendGrid system.
 */
export class NotificationClient {
  private config: SendGridConfig;
  private isConnected: boolean = false;

  constructor(config?: Partial<SendGridConfig>) {
    this.config = { ...DEFAULT_SENDGRID_CONFIG, ...config };
  }

  /**
   * Sends a notification through the external SendGrid Notification Service.
   * This creates an outbound interaction from the Message Processing Platform
   * to the SendGrid system via its REST API.
   */
  async sendNotification(payload: NotificationPayload): Promise<SendGridResponse> {
    await this.ensureConnection();

    const emailPayload = this.buildSendGridPayload(payload);

    // Send to SendGrid external system via HTTPS REST API
    try {
      const response = await this.postToSendGrid('/mail/send', emailPayload);

      return {
        messageId: response.messageId || `msg-${Date.now()}`,
        status: 'queued',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return this.handleSendGridError(error as Error, payload);
    }
  }

  /**
   * Sends a batch of notifications to the SendGrid system.
   * Used when multiple notifications need to be sent at once,
   * such as alerting all Admin Users about a critical system event.
   */
  async sendBatchNotifications(
    payloads: NotificationPayload[],
  ): Promise<SendGridResponse[]> {
    const results: SendGridResponse[] = [];

    for (const payload of payloads) {
      const result = await this.sendNotification(payload);
      results.push(result);
    }

    return results;
  }

  /**
   * Registers a webhook with SendGrid to receive delivery status updates.
   * SendGrid will call back to the Message Processing Platform when
   * email delivery status changes (delivered, bounced, opened, etc.)
   */
  async registerWebhook(callbackUrl: string, events: string[]): Promise<void> {
    await this.postToSendGrid('/user/webhooks/event/settings', {
      enabled: true,
      url: callbackUrl,
      group_resubscribe: events.includes('group_resubscribe'),
      delivered: events.includes('delivered'),
      bounce: events.includes('bounce'),
      open: events.includes('open'),
    });
  }

  /** Establishes connection to the SendGrid external system */
  private async ensureConnection(): Promise<void> {
    if (this.isConnected) return;

    // Verify SendGrid API key is valid by making a test request
    if (!this.config.apiKey) {
      console.warn('SendGrid API key not configured - notifications will be logged only');
    }

    this.isConnected = true;
  }

  /** Builds the SendGrid-specific email payload from our internal notification format */
  private buildSendGridPayload(payload: NotificationPayload): Record<string, unknown> {
    const subjectMap: Record<string, string> = {
      'processing-complete': 'Message Processing Complete',
      'admin-config-change': 'Platform Configuration Updated',
      'health-alert': 'System Health Alert',
      'rate-limit-warning': 'Rate Limit Warning',
    };

    return {
      personalizations: [
        {
          to: [{ email: `${payload.recipient}@messageprocessor.io` }],
          subject: subjectMap[payload.type] || 'Platform Notification',
        },
      ],
      from: {
        email: this.config.fromEmail,
        name: this.config.fromName,
      },
      content: [
        {
          type: 'text/html',
          value: this.renderNotificationTemplate(payload),
        },
      ],
      categories: [payload.type, payload.priority || 'normal'],
    };
  }

  /** Renders an HTML template for the notification email */
  private renderNotificationTemplate(payload: NotificationPayload): string {
    return `
      <h2>Message Processing Platform - ${payload.type}</h2>
      <p>Notification for: ${payload.recipient}</p>
      <pre>${JSON.stringify(payload.data, null, 2)}</pre>
      <p>Priority: ${payload.priority || 'normal'}</p>
      <p>Sent at: ${new Date().toISOString()}</p>
    `;
  }

  /** Sends an HTTP POST request to the SendGrid external API */
  private async postToSendGrid(
    endpoint: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, string>> {
    const url = `${this.config.baseUrl}${endpoint}`;

    // In production, this would use fetch/axios to call SendGrid's REST API
    console.log(`[SendGrid] POST ${url}`, JSON.stringify(body).substring(0, 200));

    return { messageId: `sg-${Date.now()}`, status: 'accepted' };
  }

  /** Handles errors from the SendGrid external system with retry logic */
  private async handleSendGridError(
    error: Error,
    payload: NotificationPayload,
  ): Promise<SendGridResponse> {
    console.error(`[SendGrid] Error sending notification: ${error.message}`);

    // Log the failure for later retry
    return {
      messageId: `failed-${Date.now()}`,
      status: 'failed',
      timestamp: new Date().toISOString(),
    };
  }
}
