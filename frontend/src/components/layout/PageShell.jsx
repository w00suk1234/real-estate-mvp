import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

function PageShell({ children, page, setPage }) {
  return (
    <div className="shell">
      <Sidebar page={page} setPage={setPage} />

      <main className="main-area">
        <Topbar setPage={setPage} />
        <div className="content-area">{children}</div>
      </main>
    </div>
  );
}

export default PageShell;