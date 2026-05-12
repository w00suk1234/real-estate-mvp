import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

const PAGE_PATHS = {
  "ai-recommend": "/ai-recommend",
  "team-mode": "/team",
};

function PageShell({ children, page, setPage }) {
  const handleNavigate = (nextPage) => {
    const nextPath = PAGE_PATHS[nextPage];
    if (nextPath) window.history.pushState({}, "", nextPath);
    else if (window.location.pathname !== "/") window.history.pushState({}, "", "/");
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
        <Topbar page={page} onNavigate={handleNavigate} />
        <div className="content-area">{children}</div>
      </main>
    </div>
  );
}

export default PageShell;
