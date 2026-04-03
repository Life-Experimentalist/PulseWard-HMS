import { useEffect, useMemo, useState } from "react";

var NOTIFICATION_API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env.VITE_NOTIFICATION_API_BASE_URL
    : "") || "/api/v1";

var AUTH_API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env.VITE_AUTH_API_BASE_URL
    : "") || "/api/auth-v1";

function buildSaturationClass(level) {
  if (level === "critical") {
    return "status-pill critical";
  }
  if (level === "warning") {
    return "status-pill warning";
  }
  return "status-pill normal";
}

function buildAbhaReadinessClass(status) {
  if (status === "healthy") {
    return "status-pill ready";
  }
  if (status === "at-risk") {
    return "status-pill warning";
  }
  if (status === "disabled") {
    return "status-pill disabled";
  }
  return "status-pill normal";
}

function formatLastUpdated(timestamp) {
  if (!timestamp) {
    return "Not refreshed yet";
  }

  var parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return timestamp;
  }

  return new Date(parsed).toLocaleString();
}

async function readJson(url) {
  var response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    var message = "request failed";
    try {
      var body = await response.json();
      if (body && body.message) {
        message = body.message;
      }
    } catch (_error) {
      message = response.statusText || message;
    }
    throw new Error(message + " (" + response.status + ")");
  }

  return response.json();
}

async function postJson(url, payload) {
  var response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload || {}),
  });

  var body = {};
  try {
    body = await response.json();
  } catch (_error) {
    body = {};
  }

  if (!response.ok) {
    var message = body && body.error ? body.error : response.statusText || "request failed";
    throw new Error(message + " (" + response.status + ")");
  }

  return body;
}

async function fetchConnectorReliability() {
  var retentionUrl =
    NOTIFICATION_API_BASE_URL +
    "/integrations/messaging/fault-injection/manifest/verify/attempts/retention?windowMinutes=60&limit=200";
  var trendUrl =
    NOTIFICATION_API_BASE_URL +
    "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend?windowMinutes=60&limit=200";
  var exportUrl =
    NOTIFICATION_API_BASE_URL +
    "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/escalations/export?state=escalated-warning-unacknowledged,escalated-critical-unacknowledged,escalated-critical-unmitigated&acknowledgementSlaStatus=breached&limit=10";

  var retentionPromise = readJson(retentionUrl);
  var trendPromise = readJson(trendUrl);
  var exportPromise = readJson(exportUrl);

  var results = await Promise.all([retentionPromise, trendPromise, exportPromise]);
  return {
    retention: results[0],
    trend: results[1],
    escalationExport: results[2],
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchAbhaReliability(tenantKey) {
  var readinessUrl = AUTH_API_BASE_URL + "/platform/abha/operational-readiness";
  var fallbackUrl =
    AUTH_API_BASE_URL +
    "/platform/abha/fallback-decision/telemetry?tenantKey=" +
    encodeURIComponent(tenantKey) +
    "&scenario=health-check-derived&limit=10";
  var evidenceUrl =
    AUTH_API_BASE_URL +
    "/platform/abha/transactions/evidence?tenantKey=" +
    encodeURIComponent(tenantKey) +
    "&limit=25";

  var readinessPromise = readJson(readinessUrl);
  var fallbackPromise = readJson(fallbackUrl);
  var evidencePromise = readJson(evidenceUrl);
  var results = await Promise.all([readinessPromise, fallbackPromise, evidencePromise]);

  return {
    readiness: results[0],
    fallback: results[1],
    evidence: results[2],
  };
}

async function triggerAbhaDryRunTransaction(operation, tenantKey) {
  var url = AUTH_API_BASE_URL + "/platform/abha/transactions/" + operation;
  return postJson(url, {
    tenantKey: tenantKey,
    dryRun: true,
    fallbackScenario: "happy-path",
    resourceType: operation === "write" ? "clinical-note" : "health-record",
    resourceId: operation === "write" ? "dash-note-ops" : "dash-record-ops",
    consent: {
      granted: true,
      consentId: "ops-dashboard-dry-run-consent",
      purpose: "operations-reliability-validation",
    },
    payload:
      operation === "write"
        ? {
            noteCode: "OPS-DRYRUN",
            source: "operations-dashboard",
          }
        : {
            summary: "operations dashboard dry-run read",
            source: "operations-dashboard",
          },
  });
}

function buildIncidentFeed(data) {
  if (!data || !data.retention || !data.trend || !data.escalationExport) {
    return [];
  }

  var incidents = [];
  var saturation = data.retention.telemetry ? data.retention.telemetry.saturation : null;
  if (saturation && saturation.alertLevel && saturation.alertLevel !== "normal") {
    incidents.push({
      title: "Replay-attempt retention saturation",
      severity: saturation.alertLevel === "critical" ? "High" : "Medium",
      owner: "Messaging Reliability",
      eta: saturation.alertLevel === "critical" ? "Immediate" : "This shift",
      detail: saturation.recommendedAction,
    });
  }

  var anomalies =
    data.trend.summary && Array.isArray(data.trend.summary.anomalies)
      ? data.trend.summary.anomalies
      : [];
  anomalies.slice(0, 3).forEach(function (anomaly) {
    incidents.push({
      title: "Anomaly: " + anomaly.key,
      severity: anomaly.severity === "critical" ? "High" : "Medium",
      owner: "On-call Operations",
      eta: anomaly.status === "active" ? "Open" : "Closed",
      detail: anomaly.recommendedAction,
    });
  });

  var escalations = Array.isArray(data.escalationExport.escalations)
    ? data.escalationExport.escalations
    : [];
  escalations.slice(0, 3).forEach(function (item) {
    incidents.push({
      title: "Escalation breach: " + item.anomalyKey,
      severity: item.escalationSeverity === "critical" ? "High" : "Medium",
      owner: item.triageAcknowledgedBy || "Unassigned",
      eta: item.triageAcknowledged ? "Acknowledged" : "Needs acknowledgement",
      detail:
        "State " +
        item.escalationState +
        ", SLA " +
        item.acknowledgementSlaStatus +
        ", breachSeconds=" +
        String(item.acknowledgementSlaBreachSeconds || 0),
    });
  });

  return incidents.slice(0, 8);
}

function App() {
  var tenantKey = "default";
  var [state, setState] = useState({
    loading: true,
    error: "",
    data: null,
    abhaAction: {
      loading: false,
      message: "",
      error: "",
    },
  });

  async function refreshReliability() {
    setState(function (current) {
      return {
        loading: true,
        error: "",
        data: current.data,
        abhaAction: current.abhaAction,
      };
    });

    try {
      var results = await Promise.all([fetchConnectorReliability(), fetchAbhaReliability(tenantKey)]);
      setState({
        loading: false,
        error: "",
        data: {
          connector: results[0],
          abha: results[1],
          fetchedAt: new Date().toISOString(),
        },
        abhaAction: {
          loading: false,
          message: "",
          error: "",
        },
      });
    } catch (error) {
      setState(function (current) {
        return {
          loading: false,
          error: error instanceof Error ? error.message : "Unknown telemetry error",
          data: current.data,
          abhaAction: current.abhaAction,
        };
      });
    }
  }

  async function runAbhaDryRun(operation) {
    setState(function (current) {
      return {
        loading: current.loading,
        error: current.error,
        data: current.data,
        abhaAction: {
          loading: true,
          message: "",
          error: "",
        },
      };
    });

    try {
      var response = await triggerAbhaDryRunTransaction(operation, tenantKey);
      setState(function (current) {
        return {
          loading: current.loading,
          error: current.error,
          data: current.data,
          abhaAction: {
            loading: false,
            message:
              operation.toUpperCase() +
              " dry-run completed: status=" +
              String(response.status || "unknown"),
            error: "",
          },
        };
      });
      await refreshReliability();
    } catch (error) {
      setState(function (current) {
        return {
          loading: current.loading,
          error: current.error,
          data: current.data,
          abhaAction: {
            loading: false,
            message: "",
            error: error instanceof Error ? error.message : "ABHA dry-run failed",
          },
        };
      });
    }
  }

  useEffect(function () {
    refreshReliability();
    var intervalId = window.setInterval(refreshReliability, 60000);
    return function () {
      window.clearInterval(intervalId);
    };
  }, []);

  var connectorData = state.data ? state.data.connector : null;
  var abhaData = state.data ? state.data.abha : null;

  var saturation =
    connectorData && connectorData.retention && connectorData.retention.telemetry
      ? connectorData.retention.telemetry.saturation
      : null;
  var trendSummary =
    connectorData && connectorData.trend && connectorData.trend.summary
      ? connectorData.trend.summary
      : null;
  var escalationSummary =
    connectorData && connectorData.retention && connectorData.retention.telemetry
      ? connectorData.retention.telemetry.escalation
      : null;
  var abhaReadiness = abhaData && abhaData.readiness ? abhaData.readiness : null;
  var abhaFallback = abhaData && abhaData.fallback ? abhaData.fallback : null;
  var abhaEvidence = abhaData && abhaData.evidence ? abhaData.evidence : null;
  var abhaSummary = abhaEvidence ? abhaEvidence.summary : null;

  var incidentQueue = useMemo(
    function () {
      return buildIncidentFeed(connectorData);
    },
    [connectorData]
  );

  return (
    <div className="ops-shell">
      <header className="ops-header">
        <p>PulseWard Mission Control</p>
        <h1>Operations Dashboard</h1>
        <div className="ops-meta">
          <span>Connector source: {NOTIFICATION_API_BASE_URL}</span>
          <span>ABHA source: {AUTH_API_BASE_URL}</span>
          <span>Last refresh: {formatLastUpdated(state.data ? state.data.fetchedAt : null)}</span>
          <button type="button" onClick={refreshReliability} disabled={state.loading}>
            {state.loading ? "Refreshing..." : "Refresh telemetry"}
          </button>
        </div>
      </header>

      {state.error ? <p className="ops-error">Telemetry degraded: {state.error}</p> : null}

      <section className="kpi-grid">
        <article>
          <h3>{saturation ? saturation.currentEntries : "--"}</h3>
          <p>Replay Attempts Retained</p>
        </article>
        <article>
          <h3>{saturation ? saturation.utilizationPercent + "%" : "--"}</h3>
          <p>Retention Utilization</p>
        </article>
        <article>
          <h3>{trendSummary ? trendSummary.returned : "--"}</h3>
          <p>Saturation Snapshots in Window</p>
        </article>
        <article>
          <h3>{escalationSummary ? escalationSummary.activeEscalations : "--"}</h3>
          <p>Active Escalations</p>
        </article>
        <article>
          <h3>{abhaReadiness ? abhaReadiness.readinessStatus : "--"}</h3>
          <p>ABHA Operational Status</p>
        </article>
        <article>
          <h3>{abhaEvidence ? abhaEvidence.totalRecorded : "--"}</h3>
          <p>ABHA Transaction Events</p>
        </article>
      </section>

      <section className="health-strip">
        <p>
          Alert level:
          <span className={buildSaturationClass(saturation ? saturation.alertLevel : "normal")}>
            {saturation ? saturation.alertLevel : "unknown"}
          </span>
        </p>
        <p>
          Open SLA breaches:
          <strong>
            {escalationSummary && escalationSummary.acknowledgementSla
              ? escalationSummary.acknowledgementSla.openBreachCount
              : "--"}
          </strong>
        </p>
        <p>
          Highest anomaly severity:
          <strong>{trendSummary ? trendSummary.highestAnomalySeverity || "none" : "--"}</strong>
        </p>
        <p>
          ABHA readiness:
          <span
            className={buildAbhaReadinessClass(abhaReadiness ? abhaReadiness.readinessStatus : "")}
          >
            {abhaReadiness ? abhaReadiness.readinessStatus : "unknown"}
          </span>
        </p>
      </section>

      <section className="panels">
        <article className="panel">
          <h2>Live Reliability Incident Queue</h2>
          <ul>
            {incidentQueue.length === 0 ? (
              <li>
                <strong>No active reliability incidents</strong>
                <span>normal</span>
                <span>Operations</span>
                <time>Monitoring</time>
              </li>
            ) : null}
            {incidentQueue.map((incident) => (
              <li key={incident.title}>
                <strong>{incident.title}</strong>
                <span>{incident.severity}</span>
                <span>{incident.owner}</span>
                <time>{incident.eta}</time>
                <small>{incident.detail}</small>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h2>Operator Handoff Commands</h2>
          <button type="button">Export escalation SLA breaches</button>
          <button type="button">Open anomaly triage endpoint template</button>
          <button type="button">Apply retention and escalation policy tune</button>
          <button type="button">Run ABHA and connector drill checklist</button>
          <p className="command-hint">
            Use integration runbook diagnostics and escalation export artifacts for shift handoff.
          </p>
        </article>

        <article className="panel">
          <h2>ABHA Transactional Reliability</h2>
          <div className="abha-meta-grid">
            <p>
              <span>Fallback decisions</span>
              <strong>{abhaFallback && abhaFallback.summary ? abhaFallback.summary.totalCount : "--"}</strong>
            </p>
            <p>
              <span>Simulated</span>
              <strong>{abhaSummary ? abhaSummary.simulatedCount : "--"}</strong>
            </p>
            <p>
              <span>Completed</span>
              <strong>{abhaSummary ? abhaSummary.completedCount : "--"}</strong>
            </p>
            <p>
              <span>Fallback</span>
              <strong>{abhaSummary ? abhaSummary.fallbackCount : "--"}</strong>
            </p>
            <p>
              <span>Blocked</span>
              <strong>{abhaSummary ? abhaSummary.blockedCount : "--"}</strong>
            </p>
            <p>
              <span>Failed</span>
              <strong>{abhaSummary ? abhaSummary.failedCount : "--"}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={function () {
              runAbhaDryRun("read");
            }}
            disabled={state.abhaAction.loading}
          >
            {state.abhaAction.loading ? "Running..." : "Run ABHA read dry-run"}
          </button>
          <button
            type="button"
            onClick={function () {
              runAbhaDryRun("write");
            }}
            disabled={state.abhaAction.loading}
          >
            {state.abhaAction.loading ? "Running..." : "Run ABHA write dry-run"}
          </button>
          {state.abhaAction.message ? <p className="ops-success">{state.abhaAction.message}</p> : null}
          {state.abhaAction.error ? <p className="ops-error inline">{state.abhaAction.error}</p> : null}
        </article>
      </section>
    </div>
  );
}

export default App;
