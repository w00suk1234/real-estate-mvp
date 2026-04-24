import { useCallback, useEffect, useRef, useState } from "react";
import PageShell from "../components/layout/PageShell";
import PropertyForm from "../form/PropertyForm";
import PreviewCard from "../cards/PreviewCard";
import ResultCard from "../cards/ResultCard";
import RecentBrochureList from "../cards/RecentBrochureList";
import NaverImportPanel from "../components/importer/NaverImportPanel";
import BriefingPdfView from "../components/pdf/BriefingPdfView";
import { buildPdfFileName } from "../utils/brochure";
import { downloadElementAsPdf } from "../utils/pdf";

const defaultForm = {
  title: "",
  deal_type: "월세",
  template_type: "1page",
  deposit: "",
  monthly_rent: "",
  maintenance_fee: "",
  premium: "",
  price_unit: "만원",
  price_status: "missing",
  address: "",
  supply_area: "",
  supply_area_unit: "㎡",
  exclusive_area: "",
  exclusive_area_unit: "㎡",
  floor: "",
  elevator: "",
  rooms: "0",
  restroom_type: "직접입력",
  restroom_detail: "",
  parking_count: "",
  parking_type: "무료",
  parking_fee: "",
  recommended_industry: "",
  hvac: "",
  sign_allowed: "",
  available_from: "",
  maintenance_includes: "",
  caution_notes: "",
  description: "",
  contact_name: "",
  contact_phone: "",
};

const BRIEFING_RESET_FLAG = "briefing_reset_pending";
const BRIEFING_HAS_WORK_FLAG = "briefing_has_work";
const WORK_FIELDS = [
  "title",
  "deposit",
  "monthly_rent",
  "maintenance_fee",
  "premium",
  "address",
  "supply_area",
  "exclusive_area",
  "floor",
  "rooms",
  "restroom_detail",
  "parking_count",
  "parking_fee",
  "recommended_industry",
  "hvac",
  "sign_allowed",
  "available_from",
  "maintenance_includes",
  "caution_notes",
  "description",
  "contact_name",
  "contact_phone",
];

function isUsableImportedImage(image) {
  const url = String(image?.url || "").toLowerCase();
  const alt = String(image?.alt || "").toLowerCase();
  const haystack = `${url} ${alt}`;
  if (!url.startsWith("http")) return false;
  return ![
    "sprite",
    "sp_",
    "favicon",
    "logo",
    "profile",
    "avatar",
    "default",
    "blank",
    "icon",
    "marker",
    "map",
    "npay",
    "pay",
    "banner",
    "gnb",
    "talk",
  ].some((token) => haystack.includes(token));
}

function normalizeImportedImages(images) {
  return (Array.isArray(images) ? images : [])
    .filter(isUsableImportedImage)
    .map((image, index) => ({
      url: String(image?.url || ""),
      name: String(image?.category || `naver-image-${index + 1}`),
      imported: true,
    }))
    .filter((image) => image.url)
    .slice(0, 4);
}

function createInitialForm() {
  if (typeof localStorage === "undefined") {
    return defaultForm;
  }

  const saved = localStorage.getItem("briefing_default_settings");
  if (!saved) {
    return defaultForm;
  }

  try {
    const parsed = JSON.parse(saved);
    return {
      ...defaultForm,
      deal_type: parsed.deal_type ?? defaultForm.deal_type,
      template_type: parsed.template_type ?? defaultForm.template_type,
      price_unit: parsed.price_unit ?? defaultForm.price_unit,
      supply_area_unit: parsed.supply_area_unit ?? defaultForm.supply_area_unit,
      exclusive_area_unit: parsed.exclusive_area_unit ?? defaultForm.exclusive_area_unit,
      elevator: parsed.elevator ?? defaultForm.elevator,
      parking_type: parsed.parking_type ?? defaultForm.parking_type,
      hvac: parsed.hvac ?? defaultForm.hvac,
      sign_allowed: parsed.sign_allowed ?? defaultForm.sign_allowed,
      contact_name: parsed.contact_name ?? defaultForm.contact_name,
      contact_phone: parsed.contact_phone ?? defaultForm.contact_phone,
    };
  } catch (err) {
    console.error(err);
    return defaultForm;
  }
}

function hasBriefingWork(form, mainImage, extraImages, result) {
  const hasText = WORK_FIELDS.some((key) => String(form[key] ?? "").trim());
  return hasText || Boolean(mainImage) || extraImages.length > 0 || Boolean(result);
}

function BriefingMakerPage({ setPage, importUrl, importSnapshot }) {
  const [form, setForm] = useState(() => createInitialForm());
  const [mainImage, setMainImage] = useState(null);
  const [extraImages, setExtraImages] = useState([]);
  const [result, setResult] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pdfLoading, setPdfLoading] = useState(false);
  const pdfRef = useRef(null);

  const resetWork = useCallback(() => {
    setForm(createInitialForm());
    setMainImage(null);
    setExtraImages([]);
    setResult(null);
    sessionStorage.removeItem(BRIEFING_HAS_WORK_FLAG);
  }, []);

  const applyImportedDraft = useCallback((draft) => {
    const fieldMapping = draft?.field_mapping || {};

    setForm((prev) => ({
      ...prev,
      ...fieldMapping,
    }));

    const importedImages = normalizeImportedImages(draft?.recommended_images);

    if (importedImages.length > 0) {
      setMainImage(importedImages[0]);
      setExtraImages(importedImages.slice(1));
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("briefing_default_settings");
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      setForm((prev) => ({
        ...prev,
        deal_type: parsed.deal_type ?? prev.deal_type,
        template_type: parsed.template_type ?? prev.template_type,
        price_unit: parsed.price_unit ?? prev.price_unit,
        supply_area_unit: parsed.supply_area_unit ?? prev.supply_area_unit,
        exclusive_area_unit: parsed.exclusive_area_unit ?? prev.exclusive_area_unit,
        elevator: parsed.elevator ?? prev.elevator,
        parking_type: parsed.parking_type ?? prev.parking_type,
        hvac: parsed.hvac ?? prev.hvac,
        sign_allowed: parsed.sign_allowed ?? prev.sign_allowed,
        contact_name: parsed.contact_name ?? prev.contact_name,
        contact_phone: parsed.contact_phone ?? prev.contact_phone,
      }));
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    const handleNewWork = () => {
      sessionStorage.removeItem(BRIEFING_RESET_FLAG);
      resetWork();
    };

    window.addEventListener("briefing:new", handleNewWork);

    if (sessionStorage.getItem(BRIEFING_RESET_FLAG) === "1") {
      handleNewWork();
    }

    return () => {
      window.removeEventListener("briefing:new", handleNewWork);
    };
  }, [resetWork]);

  useEffect(() => {
    const hasWork = hasBriefingWork(form, mainImage, extraImages, result);
    if (hasWork) {
      sessionStorage.setItem(BRIEFING_HAS_WORK_FLAG, "1");
      return;
    }

    sessionStorage.removeItem(BRIEFING_HAS_WORK_FLAG);
  }, [form, mainImage, extraImages, result]);

  const handleDownloadPdf = useCallback(async () => {
    if (!result?.success) return;

    try {
      setPdfLoading(true);
      await downloadElementAsPdf(pdfRef.current, buildPdfFileName(form));
    } catch (error) {
      console.error(error);
      alert(error.message || "PDF 다운로드 중 오류가 발생했습니다.");
    } finally {
      setPdfLoading(false);
    }
  }, [form, result]);

  return (
    <PageShell page="briefing" setPage={setPage}>
      <div className="page-header">
        <p className="page-badge">핵심 도구</p>
        <h1>소개서 작성</h1>
        <p className="page-desc">사무실과 상가 중개용 소개서를 빠르게 정리하고 고객용 브리핑으로 다듬습니다.</p>
      </div>

      <NaverImportPanel initialUrl={importUrl} initialSnapshot={importSnapshot} onApplyDraft={applyImportedDraft} />

      <div className="briefing-grid-v2">
        <div className="grid-card property-card">
          <PropertyForm
            form={form}
            setForm={setForm}
            mainImage={mainImage}
            setMainImage={setMainImage}
            extraImages={extraImages}
            setExtraImages={setExtraImages}
            setResult={setResult}
            onCreated={() => setRefreshKey((prev) => prev + 1)}
          />
        </div>

        <div className="grid-card preview-card-wrap">
          <PreviewCard form={form} mainImage={mainImage} extraImages={extraImages} />
        </div>

        <div className="grid-card brochure-list-card">
          <RecentBrochureList refreshKey={refreshKey} />
        </div>

        <div className="grid-card result-card-wrap">
          <ResultCard
            result={result}
            form={form}
            onDownloadPdf={handleDownloadPdf}
            pdfLoading={pdfLoading}
          />
        </div>
      </div>

      <BriefingPdfView
        ref={pdfRef}
        form={form}
        result={result}
        mainImage={mainImage}
        extraImages={extraImages}
      />
    </PageShell>
  );
}

export default BriefingMakerPage;
