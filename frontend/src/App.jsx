import { useState } from "react";
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

  let currentPage = <BriefingMakerPage setPage={setPage} />;

  if (page === "customers") currentPage = <CustomersPage setPage={setPage} />;
  if (page === "schedules") currentPage = <SchedulesPage setPage={setPage} />;
  if (page === "calculators") currentPage = <CalculatorsPage setPage={setPage} />;
  if (page === "photo-editor") currentPage = <PhotoEditorPage setPage={setPage} />;
  if (page === "address-hub") currentPage = <AddressHubPage setPage={setPage} />;
  if (page === "auth") currentPage = <LoginPage setPage={setPage} />;

  return currentPage;
}

export default App;
