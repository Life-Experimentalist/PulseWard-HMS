# PulseWard Postman Suite

This folder contains an import-ready Postman setup for PulseWard HMS APIs.

## Files

1. PulseWard-HMS.postman_collection.json
2. PulseWard-Local.postman_environment.json

## What is included

1. Requests generated from all service OpenAPI surfaces:
   - services/api-gateway/openapi.yaml
   - services/auth-service/openapi.yaml
   - services/notification-service/openapi.yaml
   - services/appointment-service/openapi.yaml
   - services/patient-service/openapi.yaml
   - services/ehr-service/openapi.yaml
   - services/lab-service/openapi.yaml
   - services/pharmacy-service/openapi.yaml
   - services/billing-service/openapi.yaml
2. Service base URL variables.
3. Tenant and token variables.
4. Path-parameter variables for common ids.
5. Basic response validation tests on each request:
   - status code is not 5xx
   - response time is under 5000 ms

## Import steps

### Postman UI

1. Open Postman.
2. Click Import.
3. Import PulseWard-HMS.postman_collection.json.
4. Import PulseWard-Local.postman_environment.json.
5. Select PulseWard-Local environment.
6. Set authToken and any required ids.
7. Run requests.

### Postman MCP notes

The collection artifacts are designed for one-click import and then execution from Postman or Postman MCP request tabs.

## Variable setup checklist

1. authToken: set a valid JWT when endpoint requires auth.
2. tenantKey: default citycare-hospital.
3. Base URLs:
   - apiGatewayBaseUrl
   - authServiceBaseUrl
   - notificationServiceBaseUrl
   - appointmentServiceBaseUrl
   - patientServiceBaseUrl
   - ehrServiceBaseUrl
   - labServiceBaseUrl
   - pharmacyServiceBaseUrl
   - billingServiceBaseUrl
4. IDs:
   - appointmentId
   - patientId
   - clinicianId
   - prescriptionId
   - recordId
   - orderId
   - anomalyInstanceId

## Regenerate suite

From repository root:

```powershell
node ./scripts/generate-postman-suite.mjs
```

Or in Bash:

```bash
node ./scripts/generate-postman-suite.mjs
```
