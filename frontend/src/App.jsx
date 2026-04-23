import { useEffect, useState } from "react";
import BriefingMakerPage from "./pages/BriefingMakerPage";
import CustomersPage from "./pages/CustomersPage";
import SchedulesPage from "./pages/SchedulesPage";
import CalculatorsPage from "./pages/CalculatorsPage";
import PhotoEditorPage from "./pages/PhotoEditorPage";
import AddressHubPage from "./pages/AddressHubPage";
import LoginPage from "./pages/LoginPage";
import "./styles/theme.css";

const NAVER_IMPORT_SNAPSHOT_KEY = "naver_import_snapshot";

function App() {
  const [page, setPage] = useState("briefing");
  const [importUrl, setImportUrl] = useState("");
  const [importSnapshot, setImportSnapshot] = useState(null);

  useEffect(() => {
    const readImportSnapshot = () => {
      const snapshotRaw =
        sessionStorage.getItem(NAVER_IMPORT_SNAPSHOT_KEY) ||
        localStorage.getItem(NAVER_IMPORT_SNAPSHOT_KEY);

      if (!snapshotRaw) return false;

      try {
        setImportSnapshot({
          ...JSON.parse(snapshotRaw),
          received_at: Date.now(),
        });
        setPage("briefing");
        return true;
      } catch (err) {
        console.error(err);
        return false;
      } finally {
        sessionStorage.removeItem(NAVER_IMPORT_SNAPSHOT_KEY);
        localStorage.removeItem(NAVER_IMPORT_SNAPSHOT_KEY);
      }
    };

    const params = new URLSearchParams(window.location.search);
    const url = params.get("import_url");
    const hasExtensionImport = params.get("extension_import") === "1";
    readImportSnapshot();

    if (url) {
      setImportUrl(url);
      setPage("briefing");
    }

    if (url || hasExtensionImport) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    window.addEventListener("naver-import-snapshot", readImportSnapshot);
    window.addEventListener("storage", readImportSnapshot);

    return () => {
      window.removeEventListener("naver-import-snapshot", readImportSnapshot);
      window.removeEventListener("storage", readImportSnapshot);
    };
  }, []);

  let currentPage = (
    <BriefingMakerPage
      setPage={setPage}
      importUrl={importUrl}
      importSnapshot={importSnapshot}
    />
  );

  if (page === "customers") currentPage = <CustomersPage setPage={setPage} />;
  if (page === "schedules") currentPage = <SchedulesPage setPage={setPage} />;
  if (page === "calculators") currentPage = <CalculatorsPage setPage={setPage} />;
  if (page === "photo-editor") currentPage = <PhotoEditorPage setPage={setPage} />;
  if (page === "address-hub") currentPage = <AddressHubPage setPage={setPage} />;
  if (page === "auth") currentPage = <LoginPage setPage={setPage} />;

  return currentPage;
}

export default App;
