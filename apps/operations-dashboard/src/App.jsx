import { useEffect, useMemo, useState } from "react";

var API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env.VITE_NOTIFICATION_API_BASE_URL
    : "") || "/api/v1";

function buildSaturationClass(level) {
  if (level === "critical") {
    return "status-pill critical";
  }
  if (level === "warning") {
    return "status-pill warning";
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

async function fetchConnectorReliability() {
  var retentionUrl =
    API_BASE_URL +
    "/integrations/messaging/fault-injection/manifest/verify/attempts/retention?windowMinutes=60&limit=200";
  var trendUrl =
    API_BASE_URL +
    "/integrations/messaging/fault-injection/manifest/verify/attempts/retention/saturation-trend?windowMinutes=60&limit=200";
  var exportUrl =
    API_BASE_URL +
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
  var [state, setState] = useState({
    loading: true,
    error: "",
    data: null,
  });

  async function refreshReliability() {
    setState(function (current) {
      return {
        loading: true,
        error: "",
        data: current.data,
      };
    });

    try {
      var payload = await fetchConnectorReliability();
      setState({
        loading: false,
        error: "",
        data: payload,
      });
    } catch (error) {
      setState(function (current) {
        return {
          loading: false,
          error: error instanceof Error ? error.message : "Unknown telemetry error",
          data: current.data,
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

  var saturation =
    state.data && state.data.retention && state.data.retention.telemetry
      ? state.data.retention.telemetry.saturation
      : null;
  var trendSummary =
    state.data && state.data.trend && state.data.trend.summary ? state.data.trend.summary : null;
  var escalationSummary =
    state.data &&
    state.data.retention &&
    state.data.retention.telemetry &&
    state.data.retention.telemetry.escalation
      ? state.data.retention.telemetry.escalation
      : null;

  var incidentQueue = useMemo(
    function () {
      return buildIncidentFeed(state.data);
    },
    [state.data]
  );

  return (
    <div className="ops-shell">
      <header className="ops-header">
        <p>PulseWard Mission Control</p>
        <h1>Operations Dashboard</h1>
        <div className="ops-meta">
          <span>Data source: {API_BASE_URL}</span>
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
      </section>
    </div>
  );
}

export default App;
