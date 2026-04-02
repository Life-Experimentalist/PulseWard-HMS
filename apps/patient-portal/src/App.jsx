const reminders = [
  { type: "Appointment", detail: "Cardiology follow-up at 11:30", when: "Today" },
  { type: "Lab", detail: "Fasting blood test due", when: "Tomorrow" },
  { type: "Medication", detail: "Take evening antihypertensive", when: "Daily 20:00" },
];

function App() {
  return (
    <div className="patient-shell">
      <header className="patient-header">
        <p>Your Care Space</p>
        <h1>Patient Portal</h1>
      </header>

      <section className="patient-grid">
        <article className="panel profile">
          <h2>Welcome Back, Riya</h2>
          <p>
            Quickly check your care timeline, upcoming appointments, and personalized reminders from
            PulseWard services.
          </p>
          <button type="button">Book New Appointment</button>
        </article>

        <article className="panel">
          <h2>Upcoming Reminders</h2>
          <ul>
            {reminders.map((reminder) => (
              <li key={reminder.detail}>
                <strong>{reminder.type}</strong>
                <span>{reminder.detail}</span>
                <time>{reminder.when}</time>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel metrics">
          <h2>Care Snapshot</h2>
          <p>
            <strong>3</strong> active prescriptions
          </p>
          <p>
            <strong>1</strong> upcoming consultation
          </p>
          <p>
            <strong>2</strong> completed tests this month
          </p>
        </article>
      </section>
    </div>
  );
}

export default App;
