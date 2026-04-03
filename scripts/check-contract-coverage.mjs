import fs from "node:fs";
import path from "node:path";

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD", "TRACE"]);
const STRICT_MODE = process.argv.includes("--strict");
const SPEC_SOURCE_OVERRIDES = (() => {
  const raw = String(process.env.CONTRACT_CHECK_SPEC_OVERRIDES || "").trim();
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed;
  } catch (_error) {
    return {};
  }
})();

const serviceChecks = [
  {
    service: "api-gateway",
    basePath: "/api",
    runtimeRouteSource: "services/api-gateway/src",
    runtimeRouteFiles: ["services/api-gateway/src"],
    openapiSpecSource: "services/api-gateway/openapi.yaml",
    coverageStatus: "covered",
    parityPractical: true,
    notes:
      "Runtime gateway handlers and OpenAPI operations are aligned for core auth, patient, and appointment routes.",
  },
  {
    service: "auth-service",
    basePath: "/api/v1 (also mounted at /api)",
    runtimeRouteSource: "services/auth-service/routes.js",
    runtimeRouteFiles: ["services/auth-service/routes.js"],
    openapiSpecSource: "services/auth-service/openapi.yaml",
    coverageStatus: "covered",
    parityPractical: true,
    notes: "Runtime route module and OpenAPI spec are both present.",
  },
  {
    service: "appointment-service",
    basePath: "/api/v1 (also mounted at /api)",
    runtimeRouteSource: "services/appointment-service/routes.js",
    runtimeRouteFiles: ["services/appointment-service/routes.js"],
    openapiSpecSource: "services/appointment-service/openapi.yaml",
    coverageStatus: "covered",
    parityPractical: true,
    notes: "Runtime route module and OpenAPI spec are both present.",
  },
  {
    service: "notification-service",
    basePath: "/api/v1 (also mounted at /api)",
    runtimeRouteSource: "services/notification-service/routes.js",
    runtimeRouteFiles: ["services/notification-service/routes.js"],
    openapiSpecSource: "services/notification-service/openapi.yaml",
    coverageStatus: "covered",
    parityPractical: true,
    notes: "Runtime route module and OpenAPI spec are both present.",
  },
  {
    service: "patient-service",
    basePath: "/api/patients",
    runtimeRouteSource: "services/patient-service/src",
    runtimeRouteFiles: ["services/patient-service/src"],
    runtimeOperationPrefix: "/patients",
    openapiSpecSource: "services/patient-service/openapi.yaml",
    coverageStatus: "covered",
    parityPractical: true,
    notes: "Runtime route declarations are inline in src; no dedicated routes.js file.",
  },
  {
    service: "ehr-service",
    basePath: "/ehr/records/{id}",
    runtimeRouteSource: "services/ehr-service/routes.js",
    runtimeRouteFiles: ["services/ehr-service/routes.js"],
    runtimeOperationPrefix: "/ehr",
    openapiSpecSource: "services/ehr-service/openapi.yaml",
    coverageStatus: "covered",
    parityPractical: true,
    notes: "Runtime routes and OpenAPI are reconciled for EHR CRUD and timeline history paths.",
  },
  {
    service: "lab-service",
    basePath: "/lab-tests (mounted at /api)",
    runtimeRouteSource: "services/lab-service/routes.js",
    runtimeRouteFiles: ["services/lab-service/routes.js"],
    openapiSpecSource: "services/lab-service/openapi.yaml",
    coverageStatus: "covered",
    parityPractical: true,
    notes:
      "Runtime route module and OpenAPI spec are reconciled for catalog, order, and result workflows.",
  },
  {
    service: "pharmacy-service",
    basePath: "/api/pharmacy",
    runtimeRouteSource: "services/pharmacy-service/src",
    runtimeRouteFiles: ["services/pharmacy-service/src"],
    openapiSpecSource: "services/pharmacy-service/openapi.yaml",
    coverageStatus: "covered",
    parityPractical: true,
    notes: "Runtime route declarations are inline in src; no dedicated routes.js file.",
  },
  {
    service: "billing-service",
    basePath: "/billing",
    runtimeRouteSource: "services/billing-service/src",
    runtimeRouteFiles: ["services/billing-service/src"],
    openapiSpecSource: "services/billing-service/openapi.yaml",
    coverageStatus: "covered",
    parityPractical: true,
    notes: "Runtime CRUD endpoints and OpenAPI are reconciled for /billing and /billing/{id}.",
  },
];

const parityAllowlist = {};

const criticalSchemaChecks = [
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "POST",
    path: "/auth/login",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400", "401", "403"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "POST",
    path: "/auth/otp/request",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400", "403"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "POST",
    path: "/auth/otp/verify",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "GET",
    path: "/auth/session/events",
    requireRequestBody: false,
    requiredResponseCodes: ["200"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "POST",
    path: "/auth/workflow-entry/check",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400", "401", "403"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "PUT",
    path: "/admin/settings",
    requireRequestBody: true,
    requiredResponseCodes: ["200"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "GET",
    path: "/auth/oauth/google/start",
    requireRequestBody: false,
    requiredResponseCodes: ["200", "403"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "POST",
    path: "/auth/oauth/google/callback",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "403"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "GET",
    path: "/auth/oauth/clerk/start",
    requireRequestBody: false,
    requiredResponseCodes: ["200", "403"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "POST",
    path: "/platform/abha/transactions/read",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "202", "403", "502"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "POST",
    path: "/platform/abha/transactions/write",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "202", "403", "502"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "GET",
    path: "/platform/abha/transactions/evidence",
    requireRequestBody: false,
    requiredResponseCodes: ["200"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "POST",
    path: "/platform/domain-config/validate",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400"],
  },
  {
    service: "auth-service",
    specSource: "services/auth-service/openapi.yaml",
    method: "POST",
    path: "/admin/settings/auth-policy/validate",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400"],
  },
  {
    service: "ehr-service",
    specSource: "services/ehr-service/openapi.yaml",
    method: "POST",
    path: "/ehr/records",
    requireRequestBody: true,
    requiredResponseCodes: ["201", "400", "409"],
  },
  {
    service: "ehr-service",
    specSource: "services/ehr-service/openapi.yaml",
    method: "PUT",
    path: "/ehr/records/{id}",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400", "404", "409"],
  },
  {
    service: "ehr-service",
    specSource: "services/ehr-service/openapi.yaml",
    method: "GET",
    path: "/ehr/records/{id}/timeline",
    requireRequestBody: false,
    requiredResponseCodes: ["200", "404"],
  },
  {
    service: "ehr-service",
    specSource: "services/ehr-service/openapi.yaml",
    method: "POST",
    path: "/ehr/records/{id}/prescriptions",
    requireRequestBody: true,
    requiredResponseCodes: ["201", "400", "404"],
  },
  {
    service: "ehr-service",
    specSource: "services/ehr-service/openapi.yaml",
    method: "POST",
    path: "/ehr/records/{id}/prescriptions/{prescriptionId}/handoff",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400", "404"],
  },
  {
    service: "appointment-service",
    specSource: "services/appointment-service/openapi.yaml",
    method: "POST",
    path: "/appointments",
    requireRequestBody: true,
    requiredResponseCodes: ["201", "400", "403", "409"],
  },
  {
    service: "appointment-service",
    specSource: "services/appointment-service/openapi.yaml",
    method: "PUT",
    path: "/appointments/{id}",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400", "403", "409"],
  },
  {
    service: "appointment-service",
    specSource: "services/appointment-service/openapi.yaml",
    method: "POST",
    path: "/opd/entries",
    requireRequestBody: true,
    requiredResponseCodes: ["201", "400", "403"],
  },
  {
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/notifications",
    requireRequestBody: true,
    requiredResponseCodes: ["201"],
  },
  {
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/test",
    requireRequestBody: true,
    requiredResponseCodes: ["200"],
  },
  {
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/appointments/events",
    requireRequestBody: true,
    requiredResponseCodes: ["201", "200", "400"],
  },
  {
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "GET",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention",
    requireRequestBody: false,
    requiredResponseCodes: ["200"],
  },
  {
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "GET",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend",
    requireRequestBody: false,
    requiredResponseCodes: ["200"],
  },
  {
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "GET",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export",
    requireRequestBody: false,
    requiredResponseCodes: ["200", "400", "403"],
  },
  {
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400", "404"],
  },
  {
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400"],
  },
  {
    service: "pharmacy-service",
    specSource: "services/pharmacy-service/openapi.yaml",
    method: "POST",
    path: "/prescriptions/handoff",
    requireRequestBody: true,
    requiredResponseCodes: ["201", "400", "409"],
  },
  {
    service: "pharmacy-service",
    specSource: "services/pharmacy-service/openapi.yaml",
    method: "PUT",
    path: "/prescriptions/{id}/status",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400", "404"],
  },
  {
    service: "lab-service",
    specSource: "services/lab-service/openapi.yaml",
    method: "POST",
    path: "/lab-tests/orders",
    requireRequestBody: true,
    requiredResponseCodes: ["201", "400"],
  },
  {
    service: "lab-service",
    specSource: "services/lab-service/openapi.yaml",
    method: "PUT",
    path: "/lab-tests/orders/{id}/status",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400", "404"],
  },
  {
    service: "lab-service",
    specSource: "services/lab-service/openapi.yaml",
    method: "POST",
    path: "/lab-tests/orders/{id}/result",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400", "404"],
  },
  {
    service: "lab-service",
    specSource: "services/lab-service/openapi.yaml",
    method: "POST",
    path: "/lab-tests/orders/{id}/report",
    requireRequestBody: true,
    requiredResponseCodes: ["200", "400", "404"],
  },
  {
    service: "billing-service",
    specSource: "services/billing-service/openapi.yaml",
    method: "POST",
    path: "/billing/hooks/clinical-trigger",
    requireRequestBody: true,
    requiredResponseCodes: ["201", "400", "403", "409"],
  },
];

const criticalParameterContractChecks = [
  {
    label:
      "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend parameters",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "GET",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend",
    type: "parameters",
    requiredParameters: [
      {
        name: "windowMinutes",
        in: "query",
        required: false,
        schema: {
          type: "integer",
          minimum: 5,
          maximum: 1440,
          default: 60,
        },
      },
      {
        name: "limit",
        in: "query",
        required: false,
        schema: {
          type: "integer",
          minimum: 1,
          maximum: 288,
          default: 24,
        },
      },
    ],
  },
  {
    label:
      "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention parameters",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "GET",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention",
    type: "parameters",
    requiredParameters: [
      {
        name: "windowMinutes",
        in: "query",
        required: false,
        schema: {
          type: "integer",
          minimum: 5,
          maximum: 1440,
          default: 60,
        },
      },
      {
        name: "limit",
        in: "query",
        required: false,
        schema: {
          type: "integer",
          minimum: 1,
          maximum: 288,
          default: 24,
        },
      },
    ],
  },
  {
    label:
      "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export parameters",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "GET",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export",
    type: "parameters",
    requiredParameters: [
      {
        name: "format",
        in: "query",
        required: false,
        schema: {
          type: "string",
          enumIncludes: ["json", "csv"],
          default: "json",
        },
      },
      {
        name: "includeRecentlyClosed",
        in: "query",
        required: false,
        schema: {
          type: "boolean",
          default: false,
        },
      },
      {
        name: "acknowledgementSlaStatus",
        in: "query",
        required: false,
        schema: {
          type: "string",
        },
      },
      {
        name: "limit",
        in: "query",
        required: false,
        schema: {
          type: "integer",
          minimum: 1,
          maximum: 5000,
          default: 500,
        },
      },
    ],
  },
  {
    label:
      "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export boolean filter parameter contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "GET",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export",
    type: "parameters",
    requiredParameters: [
      {
        name: "triageAcknowledged",
        in: "query",
        required: false,
        schema: {
          type: "boolean",
        },
      },
      {
        name: "actionRequired",
        in: "query",
        required: false,
        schema: {
          type: "boolean",
        },
      },
      {
        name: "breached",
        in: "query",
        required: false,
        schema: {
          type: "boolean",
        },
      },
    ],
  },
  {
    label:
      "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export escalation state/severity filter parameter contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "GET",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export",
    type: "parameters",
    requiredParameters: [
      {
        name: "state",
        in: "query",
        required: false,
        schema: {
          type: "string",
        },
      },
      {
        name: "escalationSeverity",
        in: "query",
        required: false,
        schema: {
          type: "string",
        },
      },
    ],
  },
  {
    label:
      "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage path parameter contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage",
    type: "parameters",
    requiredParameters: [
      {
        name: "anomalyInstanceId",
        in: "path",
        required: true,
        schema: {
          type: "string",
          format: "uuid",
        },
      },
    ],
  },
  {
    label:
      "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema acknowledge anchor",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage",
    type: "request-schema-property",
    expectedRequestBodySchemaRef:
      "#/components/schemas/MessagingFaultManifestVerifyAttemptAnomalyTriageRequest",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptAnomalyTriageRequest",
      propertyName: "acknowledge",
      type: "boolean",
      default: false,
    },
  },
  {
    label:
      "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema mitigationApplied anchor",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage",
    type: "request-schema-property",
    expectedRequestBodySchemaRef:
      "#/components/schemas/MessagingFaultManifestVerifyAttemptAnomalyTriageRequest",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptAnomalyTriageRequest",
      propertyName: "mitigationApplied",
      type: "boolean",
      default: false,
    },
  },
  {
    label:
      "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema note anchor",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage",
    type: "request-schema-property",
    expectedRequestBodySchemaRef:
      "#/components/schemas/MessagingFaultManifestVerifyAttemptAnomalyTriageRequest",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptAnomalyTriageRequest",
      propertyName: "note",
      type: "string",
    },
  },
  {
    label:
      "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema noteType anchor",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage",
    type: "request-schema-property",
    expectedRequestBodySchemaRef:
      "#/components/schemas/MessagingFaultManifestVerifyAttemptAnomalyTriageRequest",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptAnomalyTriageRequest",
      propertyName: "noteType",
      type: "string",
    },
  },
  {
    label:
      "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema mitigationEvidenceRef anchor",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage",
    type: "request-schema-property",
    expectedRequestBodySchemaRef:
      "#/components/schemas/MessagingFaultManifestVerifyAttemptAnomalyTriageRequest",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptAnomalyTriageRequest",
      propertyName: "mitigationEvidenceRef",
      type: "string",
    },
  },
  {
    label:
      "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage request schema mitigationType anchor",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage",
    type: "request-schema-property",
    expectedRequestBodySchemaRef:
      "#/components/schemas/MessagingFaultManifestVerifyAttemptAnomalyTriageRequest",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptAnomalyTriageRequest",
      propertyName: "mitigationType",
      type: "string",
    },
  },
  {
    label:
      "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema pruneNow anchor",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
    type: "request-schema-property",
    expectedRequestBodySchemaRef:
      "#/components/schemas/MessagingFaultManifestVerifyAttemptRetentionApplyRequest",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptRetentionApplyRequest",
      propertyName: "pruneNow",
      type: "boolean",
      default: true,
    },
  },
  {
    label:
      "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema dryRun anchor",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
    type: "request-schema-property",
    expectedRequestBodySchemaRef:
      "#/components/schemas/MessagingFaultManifestVerifyAttemptRetentionApplyRequest",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptRetentionApplyRequest",
      propertyName: "dryRun",
      type: "boolean",
      default: false,
    },
  },
  {
    label:
      "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema escalation policy autoDeescalateOnMitigation anchor",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
    type: "request-schema-property",
    expectedRequestBodySchemaRef:
      "#/components/schemas/MessagingFaultManifestVerifyAttemptRetentionApplyRequest",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationPolicy",
      propertyName: "autoDeescalateOnMitigation",
      type: "boolean",
      default: true,
    },
  },
  {
    label:
      "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema escalation policy enabled anchor",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
    type: "request-schema-property",
    expectedRequestBodySchemaRef:
      "#/components/schemas/MessagingFaultManifestVerifyAttemptRetentionApplyRequest",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationPolicy",
      propertyName: "enabled",
      type: "boolean",
      default: true,
    },
  },
  {
    label:
      "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema escalation export policy includeRecentlyClosedByDefault anchor",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
    type: "request-schema-property",
    expectedRequestBodySchemaRef:
      "#/components/schemas/MessagingFaultManifestVerifyAttemptRetentionApplyRequest",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationExportPolicy",
      propertyName: "includeRecentlyClosedByDefault",
      type: "boolean",
      default: false,
    },
  },
  {
    label:
      "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema escalation export policy defaultFormat anchor",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
    type: "request-schema-property",
    expectedRequestBodySchemaRef:
      "#/components/schemas/MessagingFaultManifestVerifyAttemptRetentionApplyRequest",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationExportPolicy",
      propertyName: "defaultFormat",
      type: "string",
      default: "json",
    },
  },
  {
    label:
      "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema escalation export policy enabled anchor",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
    type: "request-schema-property",
    expectedRequestBodySchemaRef:
      "#/components/schemas/MessagingFaultManifestVerifyAttemptRetentionApplyRequest",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationExportPolicy",
      propertyName: "enabled",
      type: "boolean",
      default: true,
    },
  },
  {
    label:
      "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema escalation export policy maxExportRows anchor",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
    type: "request-schema-property",
    expectedRequestBodySchemaRef:
      "#/components/schemas/MessagingFaultManifestVerifyAttemptRetentionApplyRequest",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationExportPolicy",
      propertyName: "maxExportRows",
      type: "integer",
    },
  },
  {
    label:
      "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema dedupeWindowSeconds anchor",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
    type: "request-schema-property",
    expectedRequestBodySchemaRef:
      "#/components/schemas/MessagingFaultManifestVerifyAttemptRetentionApplyRequest",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptRetentionApplyRequest",
      propertyName: "dedupeWindowSeconds",
      type: "integer",
    },
  },
  {
    label:
      "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply request schema maxEntries anchor",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
    type: "request-schema-property",
    expectedRequestBodySchemaRef:
      "#/components/schemas/MessagingFaultManifestVerifyAttemptRetentionApplyRequest",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptRetentionApplyRequest",
      propertyName: "maxEntries",
      type: "integer",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptEscalationPolicy warningUnacknowledgedEscalateAfterSeconds schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationPolicy",
      propertyName: "warningUnacknowledgedEscalateAfterSeconds",
      type: "integer",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptEscalationPolicy criticalUnacknowledgedEscalateAfterSeconds schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationPolicy",
      propertyName: "criticalUnacknowledgedEscalateAfterSeconds",
      type: "integer",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptEscalationPolicy criticalUnmitigatedEscalateAfterSeconds schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationPolicy",
      propertyName: "criticalUnmitigatedEscalateAfterSeconds",
      type: "integer",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptAnomalyEscalationAcknowledgementSla status schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptAnomalyEscalationAcknowledgementSla",
      propertyName: "status",
      type: "string",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptAnomalyEscalationAcknowledgementSla breached schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptAnomalyEscalationAcknowledgementSla",
      propertyName: "breached",
      type: "boolean",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptAnomalyEscalationAcknowledgementSla acknowledged schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptAnomalyEscalationAcknowledgementSla",
      propertyName: "acknowledged",
      type: "boolean",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptEscalationExportResponse escalations schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationExportResponse",
      propertyName: "escalations",
      type: "array",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptEscalationExportResponse totalMatched schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationExportResponse",
      propertyName: "totalMatched",
      type: "integer",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem escalationActionRequired schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationExportItem",
      propertyName: "escalationActionRequired",
      type: "boolean",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptEscalationExportFilters triageAcknowledged schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationExportFilters",
      propertyName: "triageAcknowledged",
      type: "boolean",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptEscalationExportResponse returned schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationExportResponse",
      propertyName: "returned",
      type: "integer",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem acknowledgementSlaBreached schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationExportItem",
      propertyName: "acknowledgementSlaBreached",
      type: "boolean",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptEscalationExportFilters limit schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationExportFilters",
      propertyName: "limit",
      type: "integer",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptEscalationExportResponse totalTracked schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationExportResponse",
      propertyName: "totalTracked",
      type: "integer",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptEscalationExportFilters actionRequired schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationExportFilters",
      propertyName: "actionRequired",
      type: "boolean",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem acknowledgementSlaBreachSeconds schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationExportItem",
      propertyName: "acknowledgementSlaBreachSeconds",
      type: "integer",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem triageNotesCount schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationExportItem",
      propertyName: "triageNotesCount",
      type: "integer",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem acknowledgementSlaTargetSeconds schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationExportItem",
      propertyName: "acknowledgementSlaTargetSeconds",
      type: "integer",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptEscalationExportFilters breached schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationExportFilters",
      propertyName: "breached",
      type: "boolean",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem triageAcknowledged schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationExportItem",
      propertyName: "triageAcknowledged",
      type: "boolean",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem acknowledgementSlaElapsedSeconds schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationExportItem",
      propertyName: "acknowledgementSlaElapsedSeconds",
      type: "integer",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem acknowledgementSlaRemainingSeconds schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationExportItem",
      propertyName: "acknowledgementSlaRemainingSeconds",
      type: "integer",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem triageAcknowledgedAt schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationExportItem",
      propertyName: "triageAcknowledgedAt",
      type: "string",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem triageAcknowledgedBy schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationExportItem",
      propertyName: "triageAcknowledgedBy",
      type: "string",
    },
  },
  {
    label:
      "notification-service MessagingFaultManifestVerifyAttemptEscalationExportItem acknowledgementSlaStatus schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "MessagingFaultManifestVerifyAttemptEscalationExportItem",
      propertyName: "acknowledgementSlaStatus",
      type: "string",
    },
  },
  {
    label:
      "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention response schema ref contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "GET",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention",
    type: "response-schema-ref",
    responseCode: "200",
    responseContentType: "application/json",
    expectedResponseBodySchemaRef:
      "#/components/schemas/MessagingFaultManifestVerifyAttemptRetentionStatusResponse",
  },
  {
    label:
      "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend response schema ref contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "GET",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend",
    type: "response-schema-ref",
    responseCode: "200",
    responseContentType: "application/json",
    expectedResponseBodySchemaRef:
      "#/components/schemas/MessagingFaultManifestVerifyAttemptRetentionSaturationTrendResponse",
  },
  {
    label:
      "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export JSON response schema ref contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "GET",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export",
    type: "response-schema-ref",
    responseCode: "200",
    responseContentType: "application/json",
    expectedResponseBodySchemaRef:
      "#/components/schemas/MessagingFaultManifestVerifyAttemptEscalationExportResponse",
  },
  {
    label:
      "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage response schema ref contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage",
    type: "response-schema-ref",
    responseCode: "200",
    responseContentType: "application/json",
    expectedResponseBodySchemaRef:
      "#/components/schemas/MessagingFaultManifestVerifyAttemptAnomalyTriageResponse",
  },
  {
    label:
      "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply response schema ref contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
    type: "response-schema-ref",
    responseCode: "200",
    responseContentType: "application/json",
    expectedResponseBodySchemaRef:
      "#/components/schemas/MessagingFaultManifestVerifyAttemptRetentionApplyResponse",
  },
  {
    label:
      "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export 400 error response schema ref contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "GET",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export",
    type: "response-schema-ref",
    responseCode: "400",
    responseContentType: "application/json",
    expectedResponseBodySchemaRef: "#/components/schemas/NotificationErrorResponse",
  },
  {
    label:
      "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export 403 error response schema ref contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "GET",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export",
    type: "response-schema-ref",
    responseCode: "403",
    responseContentType: "application/json",
    expectedResponseBodySchemaRef: "#/components/schemas/NotificationErrorResponse",
  },
  {
    label:
      "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage 400 error response schema ref contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage",
    type: "response-schema-ref",
    responseCode: "400",
    responseContentType: "application/json",
    expectedResponseBodySchemaRef: "#/components/schemas/NotificationErrorResponse",
  },
  {
    label:
      "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage 404 error response schema ref contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/anomalies/{anomalyInstanceId}/triage",
    type: "response-schema-ref",
    responseCode: "404",
    responseContentType: "application/json",
    expectedResponseBodySchemaRef: "#/components/schemas/NotificationErrorResponse",
  },
  {
    label:
      "notification-service POST /integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply 400 error response schema ref contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "POST",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/apply",
    type: "response-schema-ref",
    responseCode: "400",
    responseContentType: "application/json",
    expectedResponseBodySchemaRef: "#/components/schemas/NotificationErrorResponse",
  },
  {
    label: "notification-service NotificationErrorResponse message schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "NotificationErrorResponse",
      propertyName: "message",
      type: "string",
    },
  },
  {
    label: "notification-service NotificationErrorResponse code schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "NotificationErrorResponse",
      propertyName: "code",
      type: "string",
    },
  },
  {
    label: "notification-service NotificationErrorResponse details schema property contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "NotificationErrorResponse",
      propertyName: "details",
      type: "object",
    },
  },
  {
    label: "notification-service NotificationErrorResponse details additionalProperties contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    type: "schema-property-contract",
    expectedSchemaProperty: {
      schemaName: "NotificationErrorResponse",
      propertyName: "details",
      additionalProperties: true,
    },
  },
  {
    label:
      "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/export response media-type contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "GET",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/export",
    type: "response-content-types",
    responseCode: "200",
    requiredContentTypes: ["application/json", "text/csv"],
  },
  {
    label:
      "notification-service GET /integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export response media-type contract",
    service: "notification-service",
    specSource: "services/notification-service/openapi.yaml",
    method: "GET",
    path: "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export",
    type: "response-content-types",
    responseCode: "200",
    requiredContentTypes: ["application/json", "text/csv"],
  },
];

const specLinesCache = new Map();

function resolveSpecSourcePath(specSource) {
  if (!specSource) {
    return specSource;
  }

  const override = SPEC_SOURCE_OVERRIDES[specSource];
  if (typeof override !== "string" || !override.trim()) {
    return specSource;
  }

  return override.trim();
}

function existsInRepo(relativePath) {
  if (!relativePath) {
    return false;
  }

  return fs.existsSync(path.resolve(process.cwd(), relativePath));
}

function pad(value, width) {
  const text = String(value);
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function getLeadingIndent(line) {
  const match = String(line || "").match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSpecLines(specPath) {
  const resolvedSpecPath = resolveSpecSourcePath(specPath);
  if (!specLinesCache.has(resolvedSpecPath)) {
    const absolutePath = path.resolve(process.cwd(), resolvedSpecPath);
    const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/);
    specLinesCache.set(resolvedSpecPath, lines);
  }

  return specLinesCache.get(resolvedSpecPath);
}

function findOperationBlock(lines, targetPath, method) {
  let inPaths = false;
  let currentPath = "";
  const methodPattern = new RegExp(
    `^\\s{4}${escapeRegExp(String(method || "").toLowerCase())}:\\s*$`
  );

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!inPaths) {
      if (/^paths:\s*$/.test(line)) {
        inPaths = true;
      }
      continue;
    }

    if (/^[^\s#]/.test(line)) {
      break;
    }

    const pathMatch = line.match(/^\s{2}(\/[^:]*):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }

    if (currentPath !== targetPath) {
      continue;
    }

    if (!methodPattern.test(line)) {
      continue;
    }

    const start = index + 1;
    let end = lines.length;

    for (let cursor = start; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor];

      if (/^[^\s#]/.test(candidate)) {
        end = cursor;
        break;
      }

      if (/^\s{2}\/[^:]*:\s*$/.test(candidate)) {
        end = cursor;
        break;
      }

      if (/^\s{4}(get|post|put|patch|delete|options|head|trace):\s*$/i.test(candidate)) {
        end = cursor;
        break;
      }
    }

    return lines.slice(start, end);
  }

  return null;
}

function extractIndentedSection(lines, headerMatcher, indentLevel) {
  const matcher =
    headerMatcher instanceof RegExp
      ? headerMatcher
      : new RegExp(`^\\s{${indentLevel}}${escapeRegExp(headerMatcher)}:\\s*$`);

  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (matcher.test(lines[index])) {
      start = index;
      break;
    }
  }

  if (start < 0) {
    return null;
  }

  let end = lines.length;
  for (let cursor = start + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];
    if (!line.trim()) {
      continue;
    }

    if (getLeadingIndent(line) <= indentLevel) {
      end = cursor;
      break;
    }
  }

  return lines.slice(start, end);
}

function hasJsonSchemaInSection(sectionLines) {
  if (!sectionLines || sectionLines.length === 0) {
    return false;
  }

  let applicationJsonIndent = -1;
  let applicationJsonFound = false;

  for (let index = 0; index < sectionLines.length; index += 1) {
    const line = sectionLines[index];
    if (!applicationJsonFound) {
      if (line.trim() === "application/json:") {
        applicationJsonFound = true;
        applicationJsonIndent = getLeadingIndent(line);
      }
      continue;
    }

    if (!line.trim()) {
      continue;
    }

    const indent = getLeadingIndent(line);
    if (indent <= applicationJsonIndent) {
      return false;
    }

    if (line.trim().startsWith("schema:")) {
      return true;
    }
  }

  return false;
}

function parseYamlScalar(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseOperationParameters(operationLines) {
  const parameterSection = extractIndentedSection(operationLines, "parameters", 6);
  if (!parameterSection) {
    return [];
  }

  const parameters = [];
  let current = null;
  let inSchemaBlock = false;
  let inEnumBlock = false;

  for (let index = 0; index < parameterSection.length; index += 1) {
    const line = parameterSection[index];

    const nameMatch = line.match(/^\s{8}-\s+name:\s*(.+)\s*$/);
    if (nameMatch) {
      if (current) {
        parameters.push(current);
      }

      current = {
        name: String(parseYamlScalar(nameMatch[1])),
        in: null,
        required: null,
        schema: {},
      };
      inSchemaBlock = false;
      inEnumBlock = false;
      continue;
    }

    if (!current) {
      continue;
    }

    if (/^\s{10}schema:\s*$/.test(line)) {
      inSchemaBlock = true;
      inEnumBlock = false;
      continue;
    }

    if (/^\s{10}(in|required):\s*(.+)\s*$/.test(line)) {
      inSchemaBlock = false;
      inEnumBlock = false;
      const directMatch = line.match(/^\s{10}(in|required):\s*(.+)\s*$/);
      if (directMatch[1] === "in") {
        current.in = String(parseYamlScalar(directMatch[2]));
      } else {
        current.required = Boolean(parseYamlScalar(directMatch[2]));
      }
      continue;
    }

    if (!inSchemaBlock) {
      continue;
    }

    const enumHeaderMatch = line.match(/^\s{12}enum:\s*$/);
    if (enumHeaderMatch) {
      inEnumBlock = true;
      if (!Array.isArray(current.schema.enum)) {
        current.schema.enum = [];
      }
      continue;
    }

    if (inEnumBlock) {
      const enumValueMatch = line.match(/^\s{14}-\s*(.+)\s*$/);
      if (enumValueMatch) {
        current.schema.enum.push(String(parseYamlScalar(enumValueMatch[1])));
        continue;
      }

      inEnumBlock = false;
    }

    const schemaKeyValueMatch = line.match(
      /^\s{12}(type|format|minimum|maximum|default):\s*(.+)\s*$/
    );
    if (schemaKeyValueMatch) {
      current.schema[schemaKeyValueMatch[1]] = parseYamlScalar(schemaKeyValueMatch[2]);
    }
  }

  if (current) {
    parameters.push(current);
  }

  return parameters;
}

function getOperationRequestBodyContract(operationLines) {
  const requestBodySection = extractIndentedSection(operationLines, "requestBody", 6);
  if (!requestBodySection) {
    return {
      exists: false,
      required: false,
      schemaRef: null,
    };
  }

  const text = requestBodySection.join("\n");
  const requiredMatch = text.match(/^\s+required:\s*(true|false)\s*$/m);
  const refMatch = text.match(/\$ref:\s*["']?(#\/components\/schemas\/[^"'\s]+)["']?/m);

  return {
    exists: true,
    required: requiredMatch ? requiredMatch[1] === "true" : false,
    schemaRef: refMatch ? refMatch[1] : null,
  };
}

function getOperationResponseContentTypes(operationLines, responseCode) {
  const responsesSection = extractIndentedSection(operationLines, "responses", 6);
  if (!responsesSection) {
    return null;
  }

  const responseSection = extractIndentedSection(
    responsesSection,
    new RegExp(`^\\s{8}["']?${escapeRegExp(responseCode)}["']?:\\s*$`),
    8
  );
  if (!responseSection) {
    return null;
  }

  const contentSection = extractIndentedSection(responseSection, "content", 10);
  if (!contentSection) {
    return [];
  }

  const contentTypes = [];
  contentSection.forEach((line) => {
    const match = line.match(/^\s{12}([^:\s][^:]*)\s*:\s*$/);
    if (match) {
      contentTypes.push(String(match[1]).trim());
    }
  });

  return contentTypes;
}

function getOperationResponseSchemaRef(operationLines, responseCode, contentType) {
  const responsesSection = extractIndentedSection(operationLines, "responses", 6);
  if (!responsesSection) {
    return {
      responseExists: false,
      contentTypeExists: false,
      schemaRef: null,
    };
  }

  const responseSection = extractIndentedSection(
    responsesSection,
    new RegExp(`^\\s{8}["']?${escapeRegExp(responseCode)}["']?:\\s*$`),
    8
  );
  if (!responseSection) {
    return {
      responseExists: false,
      contentTypeExists: false,
      schemaRef: null,
    };
  }

  const contentSection = extractIndentedSection(responseSection, "content", 10);
  if (!contentSection) {
    return {
      responseExists: true,
      contentTypeExists: false,
      schemaRef: null,
    };
  }

  const responseContentSection = extractIndentedSection(
    contentSection,
    new RegExp(`^\\s{12}${escapeRegExp(contentType)}:\\s*$`),
    12
  );
  if (!responseContentSection) {
    return {
      responseExists: true,
      contentTypeExists: false,
      schemaRef: null,
    };
  }

  const responseText = responseContentSection.join("\n");
  const refMatch = responseText.match(/\$ref:\s*["']?(#\/components\/schemas\/[^"'\s]+)["']?/m);

  return {
    responseExists: true,
    contentTypeExists: true,
    schemaRef: refMatch ? refMatch[1] : null,
  };
}

function findSchemaPropertyContract(lines, schemaName, propertyName) {
  const schemaPattern = new RegExp(`^\\s{4}${escapeRegExp(schemaName)}:\\s*$`);
  let schemaStart = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (schemaPattern.test(lines[index])) {
      schemaStart = index;
      break;
    }
  }

  if (schemaStart < 0) {
    return null;
  }

  let schemaEnd = lines.length;
  for (let cursor = schemaStart + 1; cursor < lines.length; cursor += 1) {
    const candidate = lines[cursor];
    if (!candidate.trim()) {
      continue;
    }

    if (getLeadingIndent(candidate) <= 4) {
      schemaEnd = cursor;
      break;
    }
  }

  const schemaBlock = lines.slice(schemaStart, schemaEnd);
  const propertiesSection = extractIndentedSection(schemaBlock, "properties", 6);
  if (!propertiesSection) {
    return null;
  }

  const propertyPattern = new RegExp(`^\\s{8}${escapeRegExp(propertyName)}:\\s*$`);
  let propertyStart = -1;
  for (let index = 0; index < propertiesSection.length; index += 1) {
    if (propertyPattern.test(propertiesSection[index])) {
      propertyStart = index;
      break;
    }
  }

  if (propertyStart < 0) {
    return null;
  }

  let propertyEnd = propertiesSection.length;
  for (let cursor = propertyStart + 1; cursor < propertiesSection.length; cursor += 1) {
    const candidate = propertiesSection[cursor];
    if (!candidate.trim()) {
      continue;
    }

    if (getLeadingIndent(candidate) <= 8) {
      propertyEnd = cursor;
      break;
    }
  }

  const propertyBlock = propertiesSection.slice(propertyStart, propertyEnd);
  const contract = {};
  propertyBlock.forEach((line) => {
    const match = line.match(/^\s{10}(type|default|format|additionalProperties):\s*(.+)\s*$/);
    if (match) {
      contract[match[1]] = parseYamlScalar(match[2]);
    }
  });

  return contract;
}

function evaluateCriticalSchemaChecks() {
  const results = criticalSchemaChecks.map((check) => {
    const label = `${check.service} ${check.method.toUpperCase()} ${check.path}`;
    const failures = [];

    if (!existsInRepo(resolveSpecSourcePath(check.specSource))) {
      failures.push(`missing spec source: ${check.specSource}`);
      return { ...check, label, pass: false, failures };
    }

    const lines = getSpecLines(check.specSource);
    const operationLines = findOperationBlock(lines, check.path, check.method);

    if (!operationLines) {
      failures.push(`missing operation in spec: ${check.method.toUpperCase()} ${check.path}`);
      return { ...check, label, pass: false, failures };
    }

    if (check.requireRequestBody) {
      const requestBodySection = extractIndentedSection(operationLines, "requestBody", 6);
      if (!requestBodySection) {
        failures.push("missing requestBody section");
      } else {
        const requestText = requestBodySection.join("\n");
        if (!/^\s+required:\s*true\s*$/m.test(requestText)) {
          failures.push("requestBody.required is not true");
        }
        if (!hasJsonSchemaInSection(requestBodySection)) {
          failures.push("requestBody missing application/json schema");
        }
      }
    }

    const responsesSection = extractIndentedSection(operationLines, "responses", 6);
    if (!responsesSection) {
      failures.push("missing responses section");
    } else {
      for (const code of check.requiredResponseCodes || []) {
        const responseSection = extractIndentedSection(
          responsesSection,
          new RegExp(`^\\s{8}["']?${escapeRegExp(code)}["']?:\\s*$`),
          8
        );

        if (!responseSection) {
          failures.push(`missing response ${code}`);
          continue;
        }

        if (!hasJsonSchemaInSection(responseSection)) {
          failures.push(`response ${code} missing application/json schema`);
        }
      }
    }

    return {
      ...check,
      label,
      pass: failures.length === 0,
      failures,
    };
  });

  const failedResults = results.filter((result) => !result.pass);
  return { results, failedResults };
}

function evaluateCriticalParameterContractChecks() {
  const results = criticalParameterContractChecks.map((check) => {
    const failures = [];

    if (!existsInRepo(resolveSpecSourcePath(check.specSource))) {
      failures.push(`missing spec source: ${check.specSource}`);
      return { ...check, pass: false, failures };
    }

    const lines = getSpecLines(check.specSource);
    let operationLines = null;
    if (check.type !== "schema-property-contract") {
      operationLines = findOperationBlock(lines, check.path, check.method);

      if (!operationLines) {
        failures.push(`missing operation in spec: ${check.method.toUpperCase()} ${check.path}`);
        return { ...check, pass: false, failures };
      }
    }

    if (check.type === "parameters") {
      const actualParameters = parseOperationParameters(operationLines);

      (check.requiredParameters || []).forEach((expectedParameter) => {
        const actualParameter = actualParameters.find(
          (item) => item.name === expectedParameter.name && item.in === expectedParameter.in
        );

        if (!actualParameter) {
          failures.push(`missing parameter ${expectedParameter.in}:${expectedParameter.name}`);
          return;
        }

        if (
          expectedParameter.required !== undefined &&
          actualParameter.required !== expectedParameter.required
        ) {
          failures.push(
            `parameter ${expectedParameter.in}:${expectedParameter.name} required expected ${String(
              expectedParameter.required
            )} got ${String(actualParameter.required)}`
          );
        }

        const expectedSchema = expectedParameter.schema || {};
        if (
          expectedSchema.type !== undefined &&
          actualParameter.schema.type !== expectedSchema.type
        ) {
          failures.push(
            `parameter ${expectedParameter.in}:${expectedParameter.name} type expected ${
              expectedSchema.type
            } got ${String(actualParameter.schema.type || "")}`
          );
        }

        if (
          expectedSchema.format !== undefined &&
          actualParameter.schema.format !== expectedSchema.format
        ) {
          failures.push(
            `parameter ${expectedParameter.in}:${expectedParameter.name} format expected ${
              expectedSchema.format
            } got ${String(actualParameter.schema.format || "")}`
          );
        }

        if (
          expectedSchema.minimum !== undefined &&
          actualParameter.schema.minimum !== expectedSchema.minimum
        ) {
          failures.push(
            `parameter ${expectedParameter.in}:${expectedParameter.name} minimum expected ${String(
              expectedSchema.minimum
            )} got ${String(actualParameter.schema.minimum)}`
          );
        }

        if (
          expectedSchema.maximum !== undefined &&
          actualParameter.schema.maximum !== expectedSchema.maximum
        ) {
          failures.push(
            `parameter ${expectedParameter.in}:${expectedParameter.name} maximum expected ${String(
              expectedSchema.maximum
            )} got ${String(actualParameter.schema.maximum)}`
          );
        }

        if (
          expectedSchema.default !== undefined &&
          actualParameter.schema.default !== expectedSchema.default
        ) {
          failures.push(
            `parameter ${expectedParameter.in}:${expectedParameter.name} default expected ${String(
              expectedSchema.default
            )} got ${String(actualParameter.schema.default)}`
          );
        }

        if (Array.isArray(expectedSchema.enumIncludes) && expectedSchema.enumIncludes.length > 0) {
          const actualEnum = Array.isArray(actualParameter.schema.enum)
            ? actualParameter.schema.enum
            : [];
          expectedSchema.enumIncludes.forEach((enumValue) => {
            if (!actualEnum.includes(enumValue)) {
              failures.push(
                `parameter ${expectedParameter.in}:${expectedParameter.name} enum missing ${String(
                  enumValue
                )}`
              );
            }
          });
        }
      });
    } else if (check.type === "request-schema-property") {
      const requestBodyContract = getOperationRequestBodyContract(operationLines);

      if (!requestBodyContract.exists) {
        failures.push("missing requestBody section");
      }

      if (!requestBodyContract.required) {
        failures.push("requestBody.required is not true");
      }

      if (
        check.expectedRequestBodySchemaRef &&
        requestBodyContract.schemaRef !== check.expectedRequestBodySchemaRef
      ) {
        failures.push(
          `requestBody schema ref expected ${check.expectedRequestBodySchemaRef} got ${String(
            requestBodyContract.schemaRef || ""
          )}`
        );
      }

      const expectedProperty = check.expectedSchemaProperty;
      if (expectedProperty) {
        const propertyContract = findSchemaPropertyContract(
          lines,
          expectedProperty.schemaName,
          expectedProperty.propertyName
        );

        if (!propertyContract) {
          failures.push(
            `missing schema property ${expectedProperty.schemaName}.${expectedProperty.propertyName}`
          );
        } else {
          if (
            expectedProperty.type !== undefined &&
            propertyContract.type !== expectedProperty.type
          ) {
            failures.push(
              `schema property ${expectedProperty.schemaName}.${
                expectedProperty.propertyName
              } type expected ${expectedProperty.type} got ${String(propertyContract.type || "")}`
            );
          }

          if (
            expectedProperty.default !== undefined &&
            propertyContract.default !== expectedProperty.default
          ) {
            failures.push(
              `schema property ${expectedProperty.schemaName}.${
                expectedProperty.propertyName
              } default expected ${String(expectedProperty.default)} got ${String(
                propertyContract.default
              )}`
            );
          }
        }
      }
    } else if (check.type === "schema-property-contract") {
      const expectedProperty = check.expectedSchemaProperty;
      if (!expectedProperty) {
        failures.push("missing expectedSchemaProperty configuration");
      } else {
        const propertyContract = findSchemaPropertyContract(
          lines,
          expectedProperty.schemaName,
          expectedProperty.propertyName
        );

        if (!propertyContract) {
          failures.push(
            `missing schema property ${expectedProperty.schemaName}.${expectedProperty.propertyName}`
          );
        } else {
          if (
            expectedProperty.type !== undefined &&
            propertyContract.type !== expectedProperty.type
          ) {
            failures.push(
              `schema property ${expectedProperty.schemaName}.${
                expectedProperty.propertyName
              } type expected ${expectedProperty.type} got ${String(propertyContract.type || "")}`
            );
          }

          if (
            expectedProperty.additionalProperties !== undefined &&
            propertyContract.additionalProperties !== expectedProperty.additionalProperties
          ) {
            failures.push(
              `schema property ${expectedProperty.schemaName}.${
                expectedProperty.propertyName
              } additionalProperties expected ${String(
                expectedProperty.additionalProperties
              )} got ${String(propertyContract.additionalProperties)}`
            );
          }
        }
      }
    } else if (check.type === "response-content-types") {
      const responseContentTypes = getOperationResponseContentTypes(
        operationLines,
        String(check.responseCode || "200")
      );

      if (responseContentTypes === null) {
        failures.push(`missing response ${String(check.responseCode || "200")}`);
      } else {
        (check.requiredContentTypes || []).forEach((contentType) => {
          if (!responseContentTypes.includes(contentType)) {
            failures.push(
              `response ${String(check.responseCode || "200")} missing content type ${contentType}`
            );
          }
        });
      }
    } else if (check.type === "response-schema-ref") {
      const responseCode = String(check.responseCode || "200");
      const responseContentType = String(check.responseContentType || "application/json");
      const responseSchema = getOperationResponseSchemaRef(
        operationLines,
        responseCode,
        responseContentType
      );

      if (!responseSchema.responseExists) {
        failures.push(`missing response ${responseCode}`);
      } else if (!responseSchema.contentTypeExists) {
        failures.push(`response ${responseCode} missing content type ${responseContentType}`);
      } else if (
        check.expectedResponseBodySchemaRef &&
        responseSchema.schemaRef !== check.expectedResponseBodySchemaRef
      ) {
        failures.push(
          `responseBody schema ref expected ${check.expectedResponseBodySchemaRef} got ${String(
            responseSchema.schemaRef || ""
          )}`
        );
      }
    }

    return {
      ...check,
      pass: failures.length === 0,
      failures,
    };
  });

  const failedResults = results.filter((result) => !result.pass);
  return { results, failedResults };
}

function normalizePathSegment(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "/";
  }

  let normalized = trimmed.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  if (normalized.length > 1) {
    normalized = normalized.replace(/\/+$/g, "");
  }

  return normalized || "/";
}

function joinPaths(basePath, routePath) {
  const base = normalizePathSegment(basePath || "/");
  const route = normalizePathSegment(routePath || "/");

  if (route === "/") {
    return base;
  }

  return normalizePathSegment(base === "/" ? route : `${base}${route}`);
}

function toOpenApiPath(runtimePath) {
  return normalizePathSegment(runtimePath)
    .replace(/:([A-Za-z0-9_]+)/g, "{$1}")
    .replace(/\{[^}]+\}/g, "{param}");
}

function parseRuntimeOperations(filePath, runtimeOperationPrefix) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const source = fs.readFileSync(absolutePath, "utf8");

  const mountByReceiver = new Map();
  const usePattern =
    /([A-Za-z_$][\w$]*)\.use\(\s*["'`]([^"'`]+)["'`]\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g;
  let useMatch = usePattern.exec(source);
  while (useMatch) {
    const mountPath = normalizePathSegment(useMatch[2]);
    const mountReceiver = useMatch[3];
    mountByReceiver.set(mountReceiver, mountPath);
    useMatch = usePattern.exec(source);
  }

  const operations = new Set();
  const routePattern =
    /([A-Za-z_$][\w$]*)\.(get|post|put|patch|delete|options|head|trace)\(\s*["'`]([^"'`]+)["'`]/gi;
  let routeMatch = routePattern.exec(source);
  while (routeMatch) {
    const receiver = routeMatch[1];
    const method = routeMatch[2].toUpperCase();
    const routePath = routeMatch[3];

    if (!HTTP_METHODS.has(method)) {
      routeMatch = routePattern.exec(source);
      continue;
    }

    const mountPrefix = mountByReceiver.get(receiver) || "";
    const effectivePath = toOpenApiPath(joinPaths(mountPrefix, routePath));
    const prefixedPath = runtimeOperationPrefix
      ? toOpenApiPath(joinPaths(runtimeOperationPrefix, effectivePath))
      : effectivePath;
    operations.add(`${method} ${prefixedPath}`);
    routeMatch = routePattern.exec(source);
  }

  return operations;
}

function parseOpenApiOperations(filePath) {
  const resolvedSpecPath = resolveSpecSourcePath(filePath);
  const absolutePath = path.resolve(process.cwd(), resolvedSpecPath);
  const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/);

  const operations = new Set();
  let inPaths = false;
  let currentPath = "";

  for (const line of lines) {
    if (!inPaths) {
      if (/^paths:\s*$/.test(line)) {
        inPaths = true;
      }
      continue;
    }

    if (/^[^\s#]/.test(line)) {
      break;
    }

    const pathMatch = line.match(/^\s{2}(\/[^:]*):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }

    const methodMatch = line.match(/^\s{4}(get|post|put|patch|delete|options|head|trace):\s*$/i);
    if (methodMatch && currentPath) {
      const method = methodMatch[1].toUpperCase();
      operations.add(`${method} ${toOpenApiPath(currentPath)}`);
    }
  }

  return operations;
}

function toSortedArray(setValue) {
  return [...setValue].sort((a, b) => a.localeCompare(b));
}

function toSet(values) {
  return new Set((values || []).map((item) => String(item).trim()).filter(Boolean));
}

function diffOperations(sourceOps, compareOps) {
  const onlyInSource = [];
  for (const op of sourceOps) {
    if (!compareOps.has(op)) {
      onlyInSource.push(op);
    }
  }

  return onlyInSource.sort((a, b) => a.localeCompare(b));
}

function evaluateParity(serviceConfig) {
  const runtimeOps = new Set();
  for (const runtimeFile of serviceConfig.runtimeRouteFiles) {
    if (!existsInRepo(runtimeFile)) {
      continue;
    }

    const parsed = parseRuntimeOperations(runtimeFile, serviceConfig.runtimeOperationPrefix);
    for (const op of parsed) {
      runtimeOps.add(op);
    }
  }

  const specOps = parseOpenApiOperations(serviceConfig.openapiSpecSource);
  const runtimeOnly = diffOperations(runtimeOps, specOps);
  const specOnly = diffOperations(specOps, runtimeOps);

  const baseline = parityAllowlist[serviceConfig.service] || {
    reason: "No documented baseline exceptions.",
    runtimeOnly: [],
    specOnly: [],
  };

  const allowedRuntimeOnly = toSet(baseline.runtimeOnly);
  const allowedSpecOnly = toSet(baseline.specOnly);

  const unexpectedRuntimeOnly = runtimeOnly.filter((op) => !allowedRuntimeOnly.has(op));
  const unexpectedSpecOnly = specOnly.filter((op) => !allowedSpecOnly.has(op));
  const staleAllowedRuntimeOnly = [...allowedRuntimeOnly].filter((op) => !runtimeOnly.includes(op));
  const staleAllowedSpecOnly = [...allowedSpecOnly].filter((op) => !specOnly.includes(op));

  const parityPass = unexpectedRuntimeOnly.length === 0 && unexpectedSpecOnly.length === 0;

  let parityDetail = "semantic parity OK";
  if (!parityPass) {
    parityDetail = [
      unexpectedRuntimeOnly.length > 0
        ? `unexpected runtime-only: ${unexpectedRuntimeOnly.join(", ")}`
        : null,
      unexpectedSpecOnly.length > 0
        ? `unexpected spec-only: ${unexpectedSpecOnly.join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join("; ");
  }

  const staleAllowlist = [...staleAllowedRuntimeOnly, ...staleAllowedSpecOnly].sort((a, b) =>
    a.localeCompare(b)
  );
  if (STRICT_MODE && staleAllowlist.length > 0) {
    parityDetail =
      parityPass && parityDetail === "semantic parity OK"
        ? `strict mode stale allowlist entries: ${staleAllowlist.join(", ")}`
        : `${parityDetail}; strict mode stale allowlist entries: ${staleAllowlist.join(", ")}`;
  }

  return {
    parityPass: parityPass && (!STRICT_MODE || staleAllowlist.length === 0),
    parityDetail,
    runtimeOps: toSortedArray(runtimeOps),
    specOps: toSortedArray(specOps),
    runtimeOnly,
    specOnly,
    unexpectedRuntimeOnly,
    unexpectedSpecOnly,
    staleAllowedRuntimeOnly: staleAllowedRuntimeOnly.sort((a, b) => a.localeCompare(b)),
    staleAllowedSpecOnly: staleAllowedSpecOnly.sort((a, b) => a.localeCompare(b)),
    baselineReason: baseline.reason,
  };
}

const rows = serviceChecks.map((item) => {
  const runtimeOk = existsInRepo(item.runtimeRouteSource);
  const specOk = existsInRepo(resolveSpecSourcePath(item.openapiSpecSource));
  const presenceCheck = runtimeOk && specOk ? "PASS" : "FAIL";

  const presenceDetail =
    presenceCheck === "PASS"
      ? "ok"
      : [
          runtimeOk ? null : "runtime route source missing",
          specOk ? null : "openapi/spec source missing",
        ]
          .filter(Boolean)
          .join("; ");

  let parityCheck = "SKIP";
  let parityDetail = item.parityPractical
    ? "parity check skipped due to missing runtime/spec source"
    : "known drift; parity not practical for this service in M1.2";
  let parityResult = null;

  if (presenceCheck === "PASS") {
    parityResult = evaluateParity(item);

    if (item.parityPractical) {
      parityCheck = parityResult.parityPass ? "PASS" : "FAIL";
      parityDetail = parityResult.parityDetail;
    } else {
      parityCheck = parityResult.parityPass ? "ALLOWLISTED" : "FAIL";
      parityDetail = parityResult.parityPass
        ? `allowlisted drift (${parityResult.baselineReason})`
        : parityResult.parityDetail;
    }
  }

  return {
    ...item,
    presenceCheck,
    presenceDetail,
    parityCheck,
    parityDetail,
    parityResult,
  };
});

const headers = [
  "service",
  "base path",
  "runtime route source",
  "openapi/spec source",
  "coverage status",
  "presence check",
  "presence detail",
  "parity check",
  "parity detail",
];

const widths = headers.map((header) => header.length);
rows.forEach((row) => {
  const values = [
    row.service,
    row.basePath,
    row.runtimeRouteSource || "MISSING",
    row.openapiSpecSource || "MISSING",
    row.coverageStatus,
    row.presenceCheck,
    row.presenceDetail,
    row.parityCheck,
    row.parityDetail,
  ];

  values.forEach((value, index) => {
    widths[index] = Math.max(widths[index], String(value).length);
  });
});

function makeRow(values) {
  return `| ${values.map((value, index) => pad(value, widths[index])).join(" | ")} |`;
}

const divider = `|-${widths.map((width) => "-".repeat(width)).join("-|-")}-|`;

console.log("PulseWard M1 contract compatibility and parity check");
console.log(`Mode: ${STRICT_MODE ? "strict" : "standard"}`);
console.log(makeRow(headers));
console.log(divider);

rows.forEach((row) => {
  console.log(
    makeRow([
      row.service,
      row.basePath,
      row.runtimeRouteSource || "MISSING",
      row.openapiSpecSource || "MISSING",
      row.coverageStatus,
      row.presenceCheck,
      row.presenceDetail,
      row.parityCheck,
      row.parityDetail,
    ])
  );
});

console.log("\nParity mismatch details by service:");
rows.forEach((row) => {
  if (!row.parityResult) {
    return;
  }

  const details = row.parityResult;
  console.log(`- ${row.service}`);
  console.log(
    `  - runtime-only (${details.runtimeOnly.length}): ${details.runtimeOnly.join(", ") || "none"}`
  );
  console.log(
    `  - spec-only (${details.specOnly.length}): ${details.specOnly.join(", ") || "none"}`
  );
  console.log(
    `  - unexpected runtime-only (${details.unexpectedRuntimeOnly.length}): ${
      details.unexpectedRuntimeOnly.join(", ") || "none"
    }`
  );
  console.log(
    `  - unexpected spec-only (${details.unexpectedSpecOnly.length}): ${
      details.unexpectedSpecOnly.join(", ") || "none"
    }`
  );

  if (details.staleAllowedRuntimeOnly.length > 0 || details.staleAllowedSpecOnly.length > 0) {
    console.log(
      `  - stale allowlist runtime-only (${details.staleAllowedRuntimeOnly.length}): ${
        details.staleAllowedRuntimeOnly.join(", ") || "none"
      }`
    );
    console.log(
      `  - stale allowlist spec-only (${details.staleAllowedSpecOnly.length}): ${
        details.staleAllowedSpecOnly.join(", ") || "none"
      }`
    );
  }
});

const schemaResults = evaluateCriticalSchemaChecks();
const parameterContractResults = evaluateCriticalParameterContractChecks();

console.log("\nCritical endpoint schema checks:");
schemaResults.results.forEach((result) => {
  if (result.pass) {
    console.log(`- PASS: ${result.label}`);
    return;
  }

  console.log(`- FAIL: ${result.label}`);
  result.failures.forEach((failure) => {
    console.log(`  - ${failure}`);
  });
});

console.log("\nCritical parameter contract checks:");
parameterContractResults.results.forEach((result) => {
  if (result.pass) {
    console.log(`- PASS: ${result.label}`);
    return;
  }

  console.log(`- FAIL: ${result.label}`);
  result.failures.forEach((failure) => {
    console.log(`  - ${failure}`);
  });
});

const failedPresenceRows = rows.filter((row) => row.presenceCheck === "FAIL");
const failedParityRows = rows.filter((row) => row.parityCheck === "FAIL");
const failedSchemaRows = schemaResults.failedResults;
const failedParameterContractRows = parameterContractResults.failedResults;

if (
  failedPresenceRows.length > 0 ||
  failedParityRows.length > 0 ||
  failedSchemaRows.length > 0 ||
  failedParameterContractRows.length > 0
) {
  console.error("\nContract check failed.");

  if (failedPresenceRows.length > 0) {
    console.error(`Presence failures (${failedPresenceRows.length}):`);
    failedPresenceRows.forEach((row) => {
      console.error(`- ${row.service}: ${row.presenceDetail}`);
    });
  }

  if (failedParityRows.length > 0) {
    console.error(`Parity failures (${failedParityRows.length}):`);
    failedParityRows.forEach((row) => {
      console.error(`- ${row.service}: ${row.parityDetail}`);
    });
  }

  if (failedSchemaRows.length > 0) {
    console.error(`Schema failures (${failedSchemaRows.length}):`);
    failedSchemaRows.forEach((result) => {
      console.error(`- ${result.label}: ${result.failures.join("; ")}`);
    });
  }

  if (failedParameterContractRows.length > 0) {
    console.error(`Parameter contract failures (${failedParameterContractRows.length}):`);
    failedParameterContractRows.forEach((result) => {
      console.error(`- ${result.label}: ${result.failures.join("; ")}`);
    });
  }

  process.exit(1);
}

console.log("\nSchema check passed: critical request/response schema coverage is present.");
console.log("Contract check passed: presence, parity, and schema checks are within baseline.");
