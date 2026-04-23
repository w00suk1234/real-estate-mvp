import { useEffect, useState } from "react";
import BriefingMakerPage from "./pages/BriefingMakerPage";
import CustomersPage from "./pages/CustomersPage";
import SchedulesPage from "./pages/SchedulesPage";
import CalculatorsPage from "./pages/CalculatorsPage";
import PhotoEditorPage from "./pages/PhotoEditorPage";
import AddressHubPage from "./pages/AddressHubPage";
import LoginPage from "./pages/LoginPage";
import "./styles/theme.css";

function App() {
  const [page, setPage] = useState("briefing");
  const [importUrl, setImportUrl] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const url = params.get("import_url");
    if (!url) return;

    setImportUrl(url);
    setPage("briefing");
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  let currentPage = <BriefingMakerPage setPage={setPage} importUrl={importUrl} />;

  if (page === "customers") currentPage = <CustomersPage setPage={setPage} />;
  if (page === "schedules") currentPage = <SchedulesPage setPage={setPage} />;
  if (page === "calculators") currentPage = <CalculatorsPage setPage={setPage} />;
  if (page === "photo-editor") currentPage = <PhotoEditorPage setPage={setPage} />;
  if (page === "address-hub") currentPage = <AddressHubPage setPage={setPage} />;
  if (page === "auth") currentPage = <LoginPage setPage={setPage} />;

  return currentPage;
}

export default App;
