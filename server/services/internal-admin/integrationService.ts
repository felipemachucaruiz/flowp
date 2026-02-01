import { db } from "../../db";
import { 
  tenantIntegrationsMatias,
  internalAuditLogs,
  ebillingAlerts,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { getMatiasClient, getMatiasConfig } from "../../integrations/matias/matiasClient";
import { saveMatiasConfig } from "../../integrations/matias/index";

export async function getIntegrationStatus(tenantId: string) {
  const config = await getMatiasConfig(tenantId);
  
  if (!config) {
    return {
      isConfigured: false,
      status: "not_configured",
      baseUrl: null,
      lastAuthOkAt: null,
      lastAuthError: null,
    };
  }

  return {
    isConfigured: true,
    status: config.isEnabled ? "configured" : "disabled",
    baseUrl: config.baseUrl,
    hasPassword: config.hasPassword,
    hasToken: config.hasToken,
    defaultResolutionNumber: config.defaultResolutionNumber,
    defaultPrefix: config.defaultPrefix,
  };
}

export async function testConnection(tenantId: string, actorInternalUserId: string) {
  try {
    const client = await getMatiasClient(tenantId);
    if (!client) {
      return {
        success: false,
        message: "MATIAS integration not configured or disabled",
      };
    }

    const result = await client.testConnection();

    await db.insert(internalAuditLogs).values({
      actorInternalUserId,
      actionType: "INTEGRATION_TEST",
      tenantId,
      entityType: "integration",
      entityId: tenantId,
      metadata: { success: result.success, message: result.message },
    });

    if (!result.success) {
      await db.insert(ebillingAlerts).values({
        tenantId,
        type: "AUTH_FAIL",
        severity: "critical",
        message: result.message || "Authentication test failed",
      });
    }

    return result;
  } catch (error: any) {
    await db.insert(internalAuditLogs).values({
      actorInternalUserId,
      actionType: "INTEGRATION_TEST",
      tenantId,
      entityType: "integration",
      entityId: tenantId,
      metadata: { success: false, error: error.message },
    });

    return {
      success: false,
      message: error.message,
    };
  }
}

export async function updateIntegrationConfig(
  tenantId: string,
  data: {
    baseUrl: string;
    email: string;
    password: string;
    defaultResolutionNumber?: string;
    defaultPrefix?: string;
    isEnabled?: boolean;
  },
  actorInternalUserId: string
) {
  const result = await saveMatiasConfig(tenantId, data);

  await db.insert(internalAuditLogs).values({
    actorInternalUserId,
    actionType: "TENANT_UPDATE",
    tenantId,
    entityType: "integration",
    entityId: tenantId,
    metadata: { 
      updatedFields: Object.keys(data).filter(k => k !== "password"),
    },
  });

  return result;
}

export async function getTenantsWithIntegrationIssues() {
  const configs = await db.query.tenantIntegrationsMatias.findMany({
    where: eq(tenantIntegrationsMatias.isEnabled, true),
  });

  const issues = [];
  for (const config of configs) {
    if (!config.accessTokenEncrypted) {
      issues.push({
        tenantId: config.tenantId,
        issue: "no_token",
        message: "No authentication token cached",
      });
    } else if (config.tokenExpiresAt && new Date(config.tokenExpiresAt) < new Date()) {
      issues.push({
        tenantId: config.tenantId,
        issue: "token_expired",
        message: "Authentication token has expired",
      });
    }
  }

  return issues;
}
