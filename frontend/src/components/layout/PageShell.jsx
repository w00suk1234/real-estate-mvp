import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

function PageShell({ children, page, setPage }) {
  const handleNavigate = (nextPage) => {
    setPage?.(nextPage);
  };

  const handleResetBriefing = () => {
    setPage?.("briefing");
    window.dispatchEvent(new CustomEvent("briefing:reset"));
  };

  return (
    <div className="shell">
      <Sidebar page={page} onNavigate={handleNavigate} onResetBriefing={handleResetBriefing} />

      <main className="main-area">
        <Topbar onNavigate={handleNavigate} />
        <div className="content-area">{children}</div>
      </main>
    </div>
  );
}

export default PageShell;
