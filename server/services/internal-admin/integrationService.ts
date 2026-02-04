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
    email: config.email,
    hasPassword: config.hasPassword,
    hasToken: config.hasToken,
    defaultResolutionNumber: config.defaultResolutionNumber,
    defaultPrefix: config.defaultPrefix,
    creditNoteResolutionNumber: config.creditNoteResolutionNumber,
    creditNotePrefix: config.creditNotePrefix,
    startingNumber: config.startingNumber,
    endingNumber: config.endingNumber,
    creditNoteStartingNumber: config.creditNoteStartingNumber,
    creditNoteEndingNumber: config.creditNoteEndingNumber,
  };
}

export async function testConnection(tenantId: string, actorInternalUserId?: string | null) {
  try {
    console.log(`[IntegrationService] Testing MATIAS connection for tenant ${tenantId}`);
    
    // Check if tenant has config
    const config = await db.query.tenantIntegrationsMatias.findFirst({
      where: eq(tenantIntegrationsMatias.tenantId, tenantId),
    });
    console.log(`[IntegrationService] Tenant config: ${config ? `found (enabled: ${config.isEnabled}, hasEmail: ${!!config.email}, hasPassword: ${!!config.passwordEncrypted})` : 'not found'}`);
    
    const client = await getMatiasClient(tenantId);
    if (!client) {
      const reason = !config ? "No configuration found" 
        : !config.isEnabled ? "Integration disabled"
        : !config.email ? "Email not configured"
        : !config.passwordEncrypted ? "Password not configured"
        : "Authentication failed";
      console.log(`[IntegrationService] MATIAS client not created: ${reason}`);
      return {
        success: false,
        message: `MATIAS integration not configured or disabled (${reason})`,
      };
    }

    const result = await client.testConnection();

    if (actorInternalUserId) {
      try {
        await db.insert(internalAuditLogs).values({
          actorInternalUserId,
          actionType: "INTEGRATION_TEST",
          tenantId,
          entityType: "integration",
          entityId: tenantId,
          metadata: { success: result.success, message: result.message },
        });
      } catch (auditError) {
        console.warn("[IntegrationService] Failed to log audit event:", auditError);
      }
    }

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
    if (actorInternalUserId) {
      try {
        await db.insert(internalAuditLogs).values({
          actorInternalUserId,
          actionType: "INTEGRATION_TEST",
          tenantId,
          entityType: "integration",
          entityId: tenantId,
          metadata: { success: false, error: error.message },
        });
      } catch (auditError) {
        console.warn("[IntegrationService] Failed to log audit event:", auditError);
      }
    }

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
    creditNoteResolutionNumber?: string;
    creditNotePrefix?: string;
    startingNumber?: number | null;
    endingNumber?: number | null;
    creditNoteStartingNumber?: number | null;
    creditNoteEndingNumber?: number | null;
    isEnabled?: boolean;
  },
  actorInternalUserId?: string | null
) {
  const result = await saveMatiasConfig(tenantId, data);

  if (actorInternalUserId) {
    try {
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
    } catch (auditError) {
      console.warn("[IntegrationService] Failed to log audit event:", auditError);
    }
  }

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
