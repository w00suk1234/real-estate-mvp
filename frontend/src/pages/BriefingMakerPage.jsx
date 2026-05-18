import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import PropertyForm from "../form/PropertyForm";
import PreviewCard from "../cards/PreviewCard";
import ResultCard from "../cards/ResultCard";
import RecentBrochureList from "../cards/RecentBrochureList";
import NaverImportPanel from "../components/importer/NaverImportPanel";
import BriefingPdfView from "../components/pdf/BriefingPdfView";
import { buildPdfFileName, normalizeBriefingData } from "../utils/brochure";
import { downloadElementAsPdf, preparePdfAssets, waitForImages } from "../utils/pdf";

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
  restroom_detail: "",
  parking_count: "",
  parking_type: "무료",
  recommended_use: "",
  hvac: "",
  sign_allowed: "",
  move_in_date: "",
  admin_fee_includes: "",
  special_notes: "",
  description: "",
  office_name: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
};

const BRIEFING_RESET_FLAG = "briefing_reset_pending";
const BRIEFING_HAS_WORK_FLAG = "briefing_has_work";
const AI_BROCHURE_DRAFT_KEY = "agentnote_ai_brochure_draft";

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
  "restroom_detail",
  "parking_count",
  "recommended_use",
  "hvac",
  "sign_allowed",
  "move_in_date",
  "admin_fee_includes",
  "special_notes",
  "description",
  "office_name",
  "contact_name",
  "contact_phone",
  "contact_email",
];

function isUsableImportedImage(image) {
  const url = String(image?.url || "").toLowerCase();
  const alt = String(image?.alt || "").toLowerCase();
  const haystack = `${url} ${alt}`;
  if (!url.startsWith("http")) return false;
  return !["sprite", "favicon", "logo", "profile", "avatar", "default", "blank", "icon", "marker", "map", "npay", "pay", "banner", "gnb", "talk"].some((token) =>
    haystack.includes(token),
  );
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

function revokePreviewUrl(image) {
  const preview = String(image?.preview || "");
  if (preview.startsWith("blob:") && typeof URL !== "undefined") {
    URL.revokeObjectURL(preview);
  }
}

function createInitialForm(user) {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem("briefing_default_settings") : null;
  const defaults = saved ? JSON.parse(saved) : {};

  return {
    ...defaultForm,
    deal_type: defaults.deal_type ?? defaultForm.deal_type,
    template_type: defaults.template_type ?? defaultForm.template_type,
    price_unit: defaults.price_unit ?? defaultForm.price_unit,
    supply_area_unit: defaults.supply_area_unit ?? defaultForm.supply_area_unit,
    exclusive_area_unit: defaults.exclusive_area_unit ?? defaultForm.exclusive_area_unit,
    elevator: defaults.elevator ?? defaultForm.elevator,
    parking_type: defaults.parking_type ?? defaultForm.parking_type,
    hvac: defaults.hvac ?? defaultForm.hvac,
    sign_allowed: defaults.sign_allowed ?? defaultForm.sign_allowed,
    office_name: user?.office_name || defaults.office_name || defaultForm.office_name,
    contact_name: user?.manager_name || defaults.contact_name || defaultForm.contact_name,
    contact_phone: user?.phone || defaults.contact_phone || defaultForm.contact_phone,
    contact_email: user?.email || defaults.contact_email || defaultForm.contact_email,
  };
}

function hasBriefingWork(form, mainImage, extraImages, result) {
  const hasText = WORK_FIELDS.some((key) => String(form[key] ?? "").trim());
  return hasText || Boolean(mainImage) || extraImages.length > 0 || Boolean(result);
}

function BriefingMakerPage({ importUrl, importSnapshot }) {
  const { user } = useAuth();
  const [form, setForm] = useState(() => createInitialForm(user));
  const [mainImage, setMainImage] = useState(null);
  const [extraImages, setExtraImages] = useState([]);
  const [result, setResult] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfAssets, setPdfAssets] = useState({ mainImageSrc: "", extraImageSources: [] });
  const pdfRef = useRef(null);
  const imageStateRef = useRef({ mainImage: null, extraImages: [] });

  const resetWork = useCallback(() => {
    setForm(createInitialForm(user));
    setMainImage(null);
    setExtraImages([]);
    setResult(null);
    setPdfAssets({ mainImageSrc: "", extraImageSources: [] });
    sessionStorage.removeItem(BRIEFING_HAS_WORK_FLAG);
  }, [user]);

  const applyImportedDraft = useCallback((draft) => {
    const fieldMapping = draft?.field_mapping || {};

    setForm((prev) => ({
      ...prev,
      ...fieldMapping,
      office_name: prev.office_name || user?.office_name || "",
      contact_name: prev.contact_name || user?.manager_name || "",
      contact_phone: prev.contact_phone || user?.phone || "",
      contact_email: prev.contact_email || user?.email || "",
    }));

    const importedImages = normalizeImportedImages(draft?.recommended_images);
    if (importedImages.length > 0) {
      setMainImage(importedImages[0]);
      setExtraImages(importedImages.slice(1));
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [user]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      office_name: prev.office_name || user?.office_name || "",
      contact_name: prev.contact_name || user?.manager_name || "",
      contact_phone: prev.contact_phone || user?.phone || "",
      contact_email: prev.contact_email || user?.email || "",
    }));
  }, [user]);

  useEffect(() => {
    const handleReset = () => {
      sessionStorage.removeItem(BRIEFING_RESET_FLAG);
      resetWork();
    };
    window.addEventListener("briefing:reset", handleReset);
    if (sessionStorage.getItem(BRIEFING_RESET_FLAG) === "1") {
      handleReset();
    }
    return () => window.removeEventListener("briefing:reset", handleReset);
  }, [resetWork]);

  useEffect(() => {
    const raw = sessionStorage.getItem(AI_BROCHURE_DRAFT_KEY);
    if (!raw) return;

    try {
      const draft = JSON.parse(raw);
      if (draft?.form && typeof draft.form === "object") {
        setForm((prev) => ({
          ...prev,
          ...draft.form,
          office_name: prev.office_name || user?.office_name || "",
          contact_name: prev.contact_name || user?.manager_name || "",
          contact_phone: prev.contact_phone || user?.phone || "",
          contact_email: prev.contact_email || user?.email || "",
        }));
        setResult(null);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (error) {
      console.error(error);
    } finally {
      sessionStorage.removeItem(AI_BROCHURE_DRAFT_KEY);
    }
  }, [user]);

  useEffect(() => {
    const hasWork = hasBriefingWork(form, mainImage, extraImages, result);
    if (hasWork) {
      sessionStorage.setItem(BRIEFING_HAS_WORK_FLAG, "1");
    } else {
      sessionStorage.removeItem(BRIEFING_HAS_WORK_FLAG);
    }
  }, [form, mainImage, extraImages, result]);

  useEffect(() => {
    imageStateRef.current = { mainImage, extraImages };
  }, [mainImage, extraImages]);

  useEffect(() => {
    return () => {
      revokePreviewUrl(imageStateRef.current.mainImage);
      imageStateRef.current.extraImages.forEach(revokePreviewUrl);
    };
  }, []);

  const handleDownloadPdf = useCallback(async () => {
    if (!result?.success) return;

    try {
      setPdfLoading(true);
      const preview = normalizeBriefingData(form, { result, mainImage, extraImages });
      const preparedAssets = await preparePdfAssets({
        mainImageSrc: preview.mainPhoto?.src,
        extraImageSources: preview.extraPhotos.map((image) => image.src),
      });

      setPdfAssets(preparedAssets);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => setTimeout(resolve, 80));

      await downloadElementAsPdf(pdfRef.current, buildPdfFileName(form));
    } catch (error) {
      alert(error.message || "PDF 다운로드 중 오류가 발생했습니다.");
    } finally {
      setPdfLoading(false);
    }
  }, [extraImages, form, mainImage, result]);

  const handleOpenFinal = useCallback(() => {
    if (result?.brochure_url) {
      window.open(result.brochure_url, "_blank", "noreferrer");
    }
  }, [result]);

  const handlePrint = useCallback(async () => {
    if (result?.brochure_url) {
      const printWindow = window.open(result.brochure_url, "_blank", "noreferrer");
      if (!printWindow) alert("팝업이 차단되면 새 창에서 연 뒤 Ctrl + P로 인쇄해 주세요.");
      return;
    }
    if (!result?.success) return;

    try {
      setPdfLoading(true);
      const preview = normalizeBriefingData(form, { result, mainImage, extraImages });
      const preparedAssets = await preparePdfAssets({
        mainImageSrc: preview.mainPhoto?.src,
        extraImageSources: preview.extraPhotos.map((image) => image.src),
      });

      setPdfAssets(preparedAssets);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => setTimeout(resolve, 80));
      await waitForImages(pdfRef.current);
      window.print();
    } catch (error) {
      alert(error.message || "인쇄 준비 중 오류가 발생했습니다.");
    } finally {
      setPdfLoading(false);
    }
  }, [extraImages, form, mainImage, result]);

  return (
    <>
      <div className="page-stack briefing-workspace briefing-redesign">
        <section className="page-header-card briefing-header-card">
          <div>
            <h1>소개서 작성</h1>
            <p>매물 정보를 고객용 소개서로 빠르게 정리합니다.</p>
          </div>
        </section>

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
            <PreviewCard
              form={form}
              result={result}
              mainImage={mainImage}
              extraImages={extraImages}
              onDownloadPdf={handleDownloadPdf}
              onPrint={handlePrint}
              pdfLoading={pdfLoading}
            />
          </div>
        </div>

        <div className="briefing-support-grid">
          <details className="briefing-support-details">
            <summary>최근 생성 소개서 보기</summary>
            <div className="grid-card brochure-list-card">
              <RecentBrochureList refreshKey={refreshKey} />
            </div>
          </details>
          <details className="briefing-support-details" open={Boolean(result?.success)}>
            <summary>생성 결과 보기</summary>
            <div className="grid-card result-card-wrap">
              <ResultCard
                result={result}
                onOpenFinal={handleOpenFinal}
                onDownloadPdf={handleDownloadPdf}
                onPrint={handlePrint}
                onOpenNewTab={handleOpenFinal}
                pdfLoading={pdfLoading}
              />
            </div>
          </details>
        </div>
      </div>

      <BriefingPdfView
        ref={pdfRef}
        form={form}
        result={result}
        mainImage={mainImage}
        extraImages={extraImages}
        pdfAssets={pdfAssets}
      />
    </>
  );
}

export default BriefingMakerPage;

