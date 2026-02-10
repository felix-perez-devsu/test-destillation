/**
 * Admin Controller for the Message Processing Platform
 *
 * This controller provides administrative endpoints exclusively used by
 * Admin Users to manage the platform. Admin Users are internal team members
 * (developers, ops engineers) who configure processing strategies,
 * manage API keys for API Consumers, and oversee platform operations.
 *
 * Admin Users authenticate via session-based auth and have elevated
 * privileges to modify system configuration at runtime.
 */

import { MessageProcessor } from '../common';
import { ReverseProcessor } from '../core/reverse';
import { TitleCaseProcessor } from '../core/titlecase';
import { AVAILABLE_STRATEGIES, StrategyConfig } from '../config/strategies/strategies.config';
import { LoggingClient } from '../integrations/logging.client';
import { NotificationClient } from '../integrations/notification.client';

/** Admin user roles with different permission levels */
type AdminRole = 'super_admin' | 'ops_engineer' | 'developer';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  lastLogin: Date;
}

interface ApiKeyRecord {
  key: string;
  clientName: string;
  tier: string;
  createdBy: string;
  createdAt: Date;
  isActive: boolean;
  rateLimit: number;
}

/** In-memory store for strategy configurations (Admin Users can modify these) */
const strategyRegistry = new Map<string, { config: StrategyConfig; processor: MessageProcessor }>();

/** In-memory API key management */
const apiKeyStore = new Map<string, ApiKeyRecord>();

/**
 * Initializes the strategy registry with default configurations.
 * Called on platform startup before Admin Users make any modifications.
 */
function initializeStrategies(): void {
  const processors: Record<string, MessageProcessor> = {
    reverse: new ReverseProcessor(),
    titlecase: new TitleCaseProcessor(),
  };

  for (const config of AVAILABLE_STRATEGIES) {
    const processor = processors[config.name];
    if (processor) {
      strategyRegistry.set(config.name, { config, processor });
    }
  }
}

/**
 * Allows an Admin User to enable or disable a processing strategy.
 * Changes take effect immediately for all subsequent API Consumer requests.
 * Sends a notification to the ops team when strategies are modified.
 */
async function toggleStrategy(
  adminUser: AdminUser,
  strategyName: string,
  enabled: boolean,
): Promise<{ success: boolean; message: string }> {
  const logger = new LoggingClient();
  const notifier = new NotificationClient();

  if (adminUser.role !== 'super_admin' && adminUser.role !== 'ops_engineer') {
    logger.warn('admin.unauthorized', {
      adminId: adminUser.id,
      action: 'toggleStrategy',
      requiredRole: 'ops_engineer or super_admin',
    });
    return { success: false, message: 'Insufficient permissions' };
  }

  const entry = strategyRegistry.get(strategyName);
  if (!entry) {
    return { success: false, message: `Strategy '${strategyName}' not found` };
  }

  entry.config.enabled = enabled;
  strategyRegistry.set(strategyName, entry);

  logger.info('admin.strategy.toggled', {
    adminId: adminUser.id,
    adminName: adminUser.name,
    strategy: strategyName,
    enabled,
  });

  // Notify the ops team about the configuration change via Notification Service (SendGrid)
  await notifier.sendNotification({
    type: 'admin-config-change',
    recipient: 'ops-team',
    data: {
      changedBy: adminUser.name,
      action: `Strategy '${strategyName}' ${enabled ? 'enabled' : 'disabled'}`,
      timestamp: new Date().toISOString(),
    },
  });

  return {
    success: true,
    message: `Strategy '${strategyName}' has been ${enabled ? 'enabled' : 'disabled'}`,
  };
}

/**
 * Allows an Admin User to create a new API key for an API Consumer.
 * Admin Users manage the lifecycle of API keys including creation,
 * revocation, and rate limit adjustments.
 */
async function createApiKey(
  adminUser: AdminUser,
  clientName: string,
  tier: string,
  rateLimit: number = 100,
): Promise<{ success: boolean; apiKey?: string }> {
  const logger = new LoggingClient();

  if (adminUser.role !== 'super_admin') {
    logger.warn('admin.unauthorized', {
      adminId: adminUser.id,
      action: 'createApiKey',
    });
    return { success: false };
  }

  const apiKey = `key-${Date.now()}-${Math.random().toString(36).substr(2, 12)}`;

  const record: ApiKeyRecord = {
    key: apiKey,
    clientName,
    tier,
    createdBy: adminUser.id,
    createdAt: new Date(),
    isActive: true,
    rateLimit,
  };

  apiKeyStore.set(apiKey, record);

  logger.info('admin.apikey.created', {
    adminId: adminUser.id,
    clientName,
    tier,
    rateLimit,
  });

  return { success: true, apiKey };
}

/**
 * Allows an Admin User to revoke an existing API key.
 * This immediately prevents the associated API Consumer from making requests.
 */
async function revokeApiKey(
  adminUser: AdminUser,
  apiKey: string,
): Promise<{ success: boolean; message: string }> {
  const logger = new LoggingClient();

  const record = apiKeyStore.get(apiKey);
  if (!record) {
    return { success: false, message: 'API key not found' };
  }

  record.isActive = false;
  apiKeyStore.set(apiKey, record);

  logger.info('admin.apikey.revoked', {
    adminId: adminUser.id,
    clientName: record.clientName,
  });

  return { success: true, message: `API key for '${record.clientName}' has been revoked` };
}

/**
 * Returns the current platform configuration for the Admin User dashboard.
 * Includes strategy states, active API keys, and system status.
 */
function getPlatformStatus(adminUser: AdminUser): {
  strategies: Array<{ name: string; enabled: boolean; description: string }>;
  activeApiKeys: number;
  totalApiKeys: number;
} {
  const strategies = Array.from(strategyRegistry.values()).map(({ config }) => ({
    name: config.name,
    enabled: config.enabled,
    description: config.description,
  }));

  const activeApiKeys = Array.from(apiKeyStore.values()).filter((k) => k.isActive).length;

  return {
    strategies,
    activeApiKeys,
    totalApiKeys: apiKeyStore.size,
  };
}

export {
  initializeStrategies,
  toggleStrategy,
  createApiKey,
  revokeApiKey,
  getPlatformStatus,
  AdminUser,
  AdminRole,
};
