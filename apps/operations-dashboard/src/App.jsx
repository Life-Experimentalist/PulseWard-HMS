const incidents = [
  { title: "Notification lag", severity: "Medium", owner: "Messaging Squad", eta: "22m" },
  { title: "ABHA auth retries", severity: "Low", owner: "Identity Squad", eta: "11m" },
  { title: "Lab webhook timeout", severity: "High", owner: "Integration Squad", eta: "35m" },
];

function App() {
  return (
    <div className="ops-shell">
      <header className="ops-header">
        <p>PulseWard Mission Control</p>
        <h1>Operations Dashboard</h1>
      </header>

      <section className="kpi-grid">
        <article>
          <h3>99.94%</h3>
          <p>API Gateway Availability</p>
        </article>
        <article>
          <h3>312</h3>
          <p>Appointments Processed Today</p>
        </article>
        <article>
          <h3>21s</h3>
          <p>Median Notification Latency</p>
        </article>
        <article>
          <h3>4</h3>
          <p>Open Incident Threads</p>
        </article>
      </section>

      <section className="panels">
        <article className="panel">
          <h2>Active Incident Queue</h2>
          <ul>
            {incidents.map((incident) => (
              <li key={incident.title}>
                <strong>{incident.title}</strong>
                <span>{incident.severity}</span>
                <span>{incident.owner}</span>
                <time>{incident.eta}</time>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h2>Command Actions</h2>
          <button type="button">Run Cross-Service Health Sweep</button>
          <button type="button">Sync Provider Configuration</button>
          <button type="button">Open ABHA Status Monitor</button>
          <button type="button">Trigger Incident Drill Scenario</button>
        </article>
      </section>
    </div>
  );
}

export default App;
