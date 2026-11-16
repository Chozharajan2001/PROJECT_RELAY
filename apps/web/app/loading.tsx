export default function Loading() {
  return (
    <main style={{ padding: 24, maxWidth: "var(--content-width)" }}>
      <h1>PROJECT_RELAY — operator board</h1>
      <p aria-busy="true">Loading board…</p>
      <table className="board-table">
        <tbody>
          {[1, 2, 3].map((i) => (
            <tr key={i}>
              <td data-label="Task">…</td>
              <td data-label="State">…</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
