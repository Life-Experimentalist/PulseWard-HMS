const todaysQueue = [
  { id: "OPD-1021", patient: "Anaya R", reason: "Diabetes review", eta: "09:10" },
  { id: "OPD-1047", patient: "Harsh V", reason: "Post-op follow-up", eta: "09:40" },
  { id: "OPD-1054", patient: "Mahima P", reason: "Lab consult", eta: "10:05" },
];

const tasks = [
  "Sign 4 pending e-prescriptions",
  "Review 2 flagged EHR alerts",
  "Confirm discharge summary for Ward B-12",
  "Approve radiology callback workflow",
];

function App() {
  return (
    <div className="page-shell">
      <aside className="rail">
        <h1>Clinician</h1>
        <nav>
          <a className="active" href="#">Today</a>
          <a href="#">Patient Records</a>
          <a href="#">Orders</a>
          <a href="#">Messages</a>
          <a href="#">Analytics</a>
        </nav>
      </aside>

      <main className="content">
        <header className="hero">
          <p className="tag">PulseWard Role Experience</p>
          <h2>Focused Rounds Workspace</h2>
          <p>
            Review consultations, place care orders, and complete day-end signoff in one streamlined
            panel.
          </p>
        </header>

        <section className="grid">
          <article className="card">
            <h3>Consultation Queue</h3>
            <ul>
              {todaysQueue.map((item) => (
                <li key={item.id}>
                  <strong>{item.id}</strong>
                  <span>{item.patient}</span>
                  <span>{item.reason}</span>
                  <time>{item.eta}</time>
                </li>
              ))}
            </ul>
          </article>

          <article className="card compact">
            <h3>Action Checklist</h3>
            <ol>
              {tasks.map((task) => (
                <li key={task}>{task}</li>
              ))}
            </ol>
          </article>

          <article className="card metrics">
            <h3>Clinical Snapshot</h3>
            <div>
              <p>
                <strong>18</strong> patients seen
              </p>
              <p>
                <strong>4</strong> pending labs
              </p>
              <p>
                <strong>2</strong> urgent callbacks
              </p>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}

export default App;
