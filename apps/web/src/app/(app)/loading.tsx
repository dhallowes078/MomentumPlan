export default function AppLoading() {
  return (
    <div className="page-wrap rise" aria-busy="true" aria-label="Loading">
      <div className="skel skel-title" />
      <div className="skel skel-line" style={{ width: "55%" }} />
      <div className="card" style={{ padding: "1rem", display: "grid", gap: "0.65rem" }}>
        <div className="skel skel-line" />
        <div className="skel skel-line" style={{ width: "80%" }} />
        <div className="skel skel-line" style={{ width: "65%" }} />
        <div className="skel skel-block" />
      </div>
    </div>
  );
}
