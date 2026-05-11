import { useEffect, useState } from "react";
import BriefingMakerPage from "./pages/BriefingMakerPage";
import CustomersPage from "./pages/CustomersPage";
import SchedulesPage from "./pages/SchedulesPage";
import SettlementPage from "./pages/SettlementPage";
import AIPropertyRecommendPage from "./pages/AIPropertyRecommendPage";
import AIBriefingPage from "./pages/AIBriefingPage";
import CalculatorsPage from "./pages/CalculatorsPage";
import PhotoEditorPage from "./pages/PhotoEditorPage";
import AddressHubPage from "./pages/AddressHubPage";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import PageShell from "./components/layout/PageShell";
import { apiFetch } from "./api";
import "./styles/theme.css";
import "./styles/agentnote-ops.css";

const NAVER_IMPORT_SNAPSHOT_KEY = "naver_import_snapshot";

const PATH_PAGE_MAP = {
  "/ai-recommend": "ai-recommend",
  "/ai-briefing": "ai-briefing",
  "/recommendations": "ai-recommend",
};

function getInitialPage() {
  const params = new URLSearchParams(window.location.search);
  return params.get("page") || PATH_PAGE_MAP[window.location.pathname] || "schedules";
}

function sanitizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;

  const pairs = Array.isArray(snapshot.pairs)
    ? snapshot.pairs
        .map((pair) => ({
          key: String(pair?.key || ""),
          value: String(pair?.value || ""),
        }))
        .filter((pair) => pair.key || pair.value)
        .slice(0, 80)
    : [];

  const images = Array.isArray(snapshot.images)
    ? snapshot.images
        .map((image) => ({
          url: String(image?.url || ""),
          alt: String(image?.alt || ""),
          source: String(image?.source || "extension"),
          width: Number.isFinite(Number(image?.width)) ? Math.round(Number(image.width)) : 0,
          height: Number.isFinite(Number(image?.height)) ? Math.round(Number(image.height)) : 0,
        }))
        .filter((image) => image.url)
        .slice(0, 6)
    : [];

  const parsedFields =
    snapshot.parsed_fields && typeof snapshot.parsed_fields === "object"
      ? Object.fromEntries(
          Object.entries(snapshot.parsed_fields).map(([key, value]) => [
            String(key || ""),
            String(value || ""),
          ]),
        )
      : {};

  return {
    listing_url: String(snapshot.listing_url || ""),
    title: String(snapshot.title || ""),
    page_title: String(snapshot.page_title || ""),
    visible_text: String(snapshot.visible_text || ""),
    focused_text: String(snapshot.focused_text || ""),
    panel_texts: Array.isArray(snapshot.panel_texts)
      ? snapshot.panel_texts.map((text) => String(text || "")).slice(0, 10)
      : [],
    pairs,
    images,
    parsed_fields: parsedFields,
  };
}

function decodeSnapshotPayload(payload) {
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (err) {
    console.error(err);
    return null;
  }
}

function readImportPayload() {
  const hash = window.location.hash || "";
  const hashMatch = hash.match(/(?:snapshot|import)=([^&]+)/);
  const params = new URLSearchParams(window.location.search);
  return decodeSnapshotPayload(hashMatch?.[1] || params.get("import") || params.get("snapshot") || "");
}

async function fetchHandoffSnapshot(handoffId) {
  if (!handoffId) return null;

  try {
    const data = await apiFetch(`/import/extension-handoff/${handoffId}`, {
      auth: false,
    });
    return data?.snapshot || null;
  } catch (err) {
    console.error(err);
    return null;
  }
}

function App() {
  const [page, setPage] = useState(getInitialPage);
  const [importUrl, setImportUrl] = useState("");
  const [importSnapshot, setImportSnapshot] = useState(null);

  useEffect(() => {
    const readImportSnapshot = async () => {
      const params = new URLSearchParams(window.location.search);
      const handoffId = params.get("handoff_id");
      const handoffSnapshot = await fetchHandoffSnapshot(handoffId);
      const hashSnapshot = readImportPayload();
      const snapshotRaw =
        sessionStorage.getItem(NAVER_IMPORT_SNAPSHOT_KEY) ||
        localStorage.getItem(NAVER_IMPORT_SNAPSHOT_KEY);

      if (!handoffSnapshot && !hashSnapshot && !snapshotRaw) return false;

      try {
        const storedSnapshot = snapshotRaw ? JSON.parse(snapshotRaw) : null;
        const safeSnapshot = sanitizeSnapshot(handoffSnapshot || hashSnapshot || storedSnapshot);
        if (!safeSnapshot) return false;

        setImportSnapshot({
          ...safeSnapshot,
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

    const bootstrap = async () => {
      const params = new URLSearchParams(window.location.search);
      const url = params.get("import_url");
      const hasExtensionImport = params.get("extension_import") === "1";
      const hasHandoffId = Boolean(params.get("handoff_id"));

      await readImportSnapshot();

      if (url) {
        setImportUrl(url);
        setPage("briefing");
      }

      if (
        url ||
        hasExtensionImport ||
        hasHandoffId ||
        window.location.hash.includes("snapshot=") ||
        window.location.hash.includes("import=") ||
        params.has("import") ||
        params.has("snapshot")
      ) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    };

    bootstrap();

    window.addEventListener("naver-import-snapshot", readImportSnapshot);
    window.addEventListener("storage", readImportSnapshot);

    return () => {
      window.removeEventListener("naver-import-snapshot", readImportSnapshot);
      window.removeEventListener("storage", readImportSnapshot);
    };
  }, []);

  if (page === "auth" || page === "login") {
    return <LoginPage setPage={setPage} />;
  }

  let currentPage = (
    <BriefingMakerPage
      setPage={setPage}
      importUrl={importUrl}
      importSnapshot={importSnapshot}
    />
  );

  if (page === "customers") currentPage = <CustomersPage setPage={setPage} />;
  if (page === "schedules") currentPage = <SchedulesPage setPage={setPage} />;
  if (page === "settlement") currentPage = <SettlementPage setPage={setPage} />;
  if (page === "ai-recommend") currentPage = <AIPropertyRecommendPage setPage={setPage} />;
  if (page === "ai-briefing") currentPage = <AIBriefingPage setPage={setPage} />;
  if (page === "calculators") currentPage = <CalculatorsPage setPage={setPage} />;
  if (page === "photo-editor") currentPage = <PhotoEditorPage setPage={setPage} />;
  if (page === "address-hub") currentPage = <AddressHubPage setPage={setPage} />;
  if (page === "profile") currentPage = <ProfilePage setPage={setPage} />;

  return (
    <PageShell page={page} setPage={setPage}>
      {currentPage}
    </PageShell>
  );
}

export default App;
