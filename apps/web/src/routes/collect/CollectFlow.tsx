import React, { useState, useEffect } from "react";
import { db, CachedMember, CachedPrice } from "../../offline/db.js";
import { enqueuePurchase } from "../../offline/queue.js";
import { syncPurchases } from "../../offline/syncClient.js";
import {
  resizeImage,
  requestPhotoReading,
  queuePhotoOffline,
  DisplayReading,
} from "../../offline/photoReader.js";
import {
  netWeightX10,
  amountPaise,
  formatRupees,
  moisturePermille,
} from "@procurement/shared";
import { StepShell } from "../../ui/StepShell.js";
import { Numpad } from "../../ui/Numpad.js";
import { Slip, SlipProps } from "../../ui/Slip.js";
import { Button } from "../../ui/Button.js";

export function CollectFlow() {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Form State (persisted across back navigation)
  const [selectedMember, setSelectedMember] = useState<CachedMember | null>(null);
  const [crop, setCrop] = useState<"Soybean" | "Tur">("Soybean");
  const [grade] = useState<string>("FAQ");
  const [grossInput, setGrossInput] = useState<string>("1250.0");
  const [tareInput, setTareInput] = useState<string>("18.0");
  const [moistureInput, setMoistureInput] = useState<string>("11.5");
  const [activeInput, setActiveInput] = useState<"gross" | "tare" | "moisture">("gross");

  // Photos & AI Photo Reading (§10.2)
  const [scalePhotoAttached, setScalePhotoAttached] = useState<boolean>(false);
  const [meterPhotoData, setMeterPhotoData] = useState<string | null>(null);
  const [aiReading, setAiReading] = useState<DisplayReading | null>(null);
  const [isReadingPhoto, setIsReadingPhoto] = useState<boolean>(false);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [mismatchConfirmed, setMismatchConfirmed] = useState<boolean>(false);

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CachedMember[]>([]);

  // Prices & Network State
  const [prices, setPrices] = useState<CachedPrice[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [createdSlip, setCreatedSlip] = useState<SlipProps | null>(null);

  // Online / Offline listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Load prices & search members
  useEffect(() => {
    async function loadData() {
      const p = await db.prices.toArray();
      setPrices(p);
      const members = await db.searchMembers(searchQuery, 15);
      setSearchResults(members);
    }
    loadData();
  }, [searchQuery]);

  // Derived price for current crop
  const activePriceRecord = prices.find((p) => p.crop.toLowerCase() === crop.toLowerCase());
  const ratePaise = activePriceRecord?.ratePaisePerQuintal || (crop === "Soybean" ? 485000 : 720000);
  const rateRupees = Math.floor(ratePaise / 100);
  const priceVersion = activePriceRecord?.version || 1;

  // Exact math from shared package
  const grossTenths = Math.round((parseFloat(grossInput) || 0) * 10);
  const tareTenths = Math.round((parseFloat(tareInput) || 0) * 10);
  const moistureTenths = Math.round((parseFloat(moistureInput) || 0) * 10);
  const beforeDeductionTenths = Math.max(0, grossTenths - tareTenths);

  let netTenths = 0;
  let amountPaiseValue = 0;
  let deductionTenths = 0;
  let mathError: string | null = null;

  try {
    if (grossTenths >= tareTenths && moistureTenths >= 0) {
      netTenths = netWeightX10(grossTenths, tareTenths, moistureTenths);
      amountPaiseValue = amountPaise(netTenths, ratePaise);
      deductionTenths = beforeDeductionTenths - netTenths;
    } else if (tareTenths > grossTenths) {
      mathError = "काट्याचे वजन एकूण वजनापेक्षा जास्त असू शकत नाही (Tare exceeds gross)";
    }
  } catch (err: any) {
    mathError = err.message;
  }

  // Numpad handler
  const handleDigit = (digit: string) => {
    const updater = (prev: string) => {
      if (digit === "." && prev.includes(".")) return prev;
      if (prev === "0" && digit !== ".") return digit;
      return prev + digit;
    };

    if (activeInput === "gross") setGrossInput(updater);
    else if (activeInput === "tare") setTareInput(updater);
    else if (activeInput === "moisture") setMoistureInput(updater);
  };

  const handleBackspace = () => {
    const updater = (prev: string) => prev.slice(0, -1) || "0";
    if (activeInput === "gross") setGrossInput(updater);
    else if (activeInput === "tare") setTareInput(updater);
    else if (activeInput === "moisture") setMoistureInput(updater);
  };

  const handleClear = () => {
    if (activeInput === "gross") setGrossInput("0");
    else if (activeInput === "tare") setTareInput("0");
    else if (activeInput === "moisture") setMoistureInput("0");
  };

  // Submit Purchase (Offline-first signed hash chain §9.5)
  const handleSavePurchase = async () => {
    if (!selectedMember) return;
    if (selectedMember.consentWithdrawn) {
      setSaveError("या सभासदाने DPDP कायद्यांतर्गत संमती मागे घेतली आहे. खरेदी नोंदवता येणार नाही.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      // 1. Enqueue into signed, hash-chained local outbox
      const { slip } = await enqueuePurchase({
        memberId: selectedMember.id,
        farmerName: selectedMember.name,
        crop,
        grade,
        grossX10: grossTenths,
        tareX10: tareTenths,
        moistureX10: moistureTenths,
        ratePaise,
        priceVersion,
        centreCode: "C07",
      });

      // 2. Render slip immediately
      setCreatedSlip(slip);
      setStep(5);

      // 3. If online, trigger background sync
      if (typeof navigator !== "undefined" && navigator.onLine) {
        syncPurchases()
          .then((syncRes) => {
            if (syncRes.syncedCount > 0) {
              setCreatedSlip((prev) =>
                prev ? { ...prev, smsStatus: "sent" } : null
              );
            }
          })
          .catch((err) => {
            console.warn("Background sync error:", err);
          });
      }
    } catch (err: any) {
      setSaveError(err.message || "खरेदी साठवताना त्रुटी आली");
    } finally {
      setIsSaving(false);
    }
  };

  // Photo capture and AI LCD reading (§10.2)
  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsReadingPhoto(true);
      setPhotoNotice(null);
      setMismatchConfirmed(false);

      const base64 = await resizeImage(file, 1200);
      setMeterPhotoData(base64);

      if (navigator.onLine) {
        try {
          const reading = await requestPhotoReading(base64, "meter");
          setAiReading(reading);
          if (reading.value !== null && Number.isFinite(reading.value)) {
            setMoistureInput(reading.value.toFixed(1));
          }
        } catch (serverErr: any) {
          console.warn("Server vision read failed, fallback to manual numpad:", serverErr);
          setPhotoNotice("सर्व्हरवरून वाचन अशक्य. मॅन्युअल कीपॅड वापरा. फोटो साठवला गेला आहे.");
          setMismatchConfirmed(true);
          await queuePhotoOffline({
            id: `photo-${Date.now()}`,
            kind: "meter",
            imageData: base64,
            typedValueX10: moistureTenths,
            matched: false,
            aiNote: "Fallback to offline manual input",
          });
        }
      } else {
        setPhotoNotice("ऑफलाइन मोड: फोटो साठवला आहे, नेटवर्क आल्यावर सर्व्हरवर पाठवला जाईल.");
        setMismatchConfirmed(true);
        await queuePhotoOffline({
          id: `photo-${Date.now()}`,
          kind: "meter",
          imageData: base64,
          typedValueX10: moistureTenths,
          matched: false,
          aiNote: "Captured offline",
        });
      }
    } catch (err: any) {
      console.warn("Failed to process photo:", err);
      setPhotoNotice("फोटो प्रक्रिया करताना त्रुटी. मॅन्युअल इनपुट सुरू ठेवा.");
      setMismatchConfirmed(true);
    } finally {
      setIsReadingPhoto(false);
      e.target.value = "";
    }
  };

  const handleReset = () => {
    setSelectedMember(null);
    setGrossInput("1250.0");
    setTareInput("18.0");
    setMoistureInput("11.5");
    setScalePhotoAttached(false);
    setMeterPhotoData(null);
    setAiReading(null);
    setIsReadingPhoto(false);
    setPhotoNotice(null);
    setMismatchConfirmed(false);
    setSaveError(null);
    setCreatedSlip(null);
    setStep(1);
  };

  // -------------------------------------------------------------------------
  // STEP 5: SLIP VIEW (§11)
  // -------------------------------------------------------------------------
  if (step === 5 && createdSlip) {
    return (
      <div className="py-4 px-2 flex flex-col justify-center items-center">
        <Slip
          slipNo={createdSlip.slipNo}
          farmerName={createdSlip.farmerName}
          crop={createdSlip.crop}
          netKg={createdSlip.netKg}
          moisturePercent={createdSlip.moisturePercent}
          ratePerQuintal={createdSlip.ratePerQuintal}
          amountPaise={createdSlip.amountPaise}
          smsStatus={createdSlip.smsStatus}
          onNewPurchase={handleReset}
        />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // STEP 1: MEMBER SELECTION (Two Taps §13.2)
  // -------------------------------------------------------------------------
  if (step === 1) {
    return (
      <StepShell
        stepCurrent={1}
        stepTotal={4}
        title="सभासद निवडा"
        isOnline={isOnline}
        priceDate={`RATE VERSION: v${priceVersion}`}
      >
        <div className="flex flex-col gap-4">
          {/* Search Bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="नाव, आडनाव, गाव किंवा कोडने शोधा... (SEARCH MEMBER)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full min-h-[50px] px-4 py-3 text-base font-sans font-medium border-2 border-chaos-black bg-chaos-paper focus:bg-white focus:outline-none focus:shadow-tactile-orange transition-all placeholder:text-chaos-muted"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-3 font-mono text-sm font-bold text-chaos-muted hover:text-chaos-black px-2 py-1"
              >
                ✕ CLEAR
              </button>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-chaos-muted font-bold">
              सभासद यादी // DIRECTORY TAP TO SELECT:
            </span>
            <span className="font-mono text-[11px] text-chaos-muted">
              {searchResults.length} RECORDS FOUND
            </span>
          </div>

          {/* Members List */}
          <div className="flex flex-col gap-2.5 max-h-[55vh] overflow-y-auto pr-1">
            {searchResults.length === 0 ? (
              <div className="text-center py-12 text-chaos-muted bg-chaos-paper border-2 border-dashed border-chaos-black/40 font-mono text-xs uppercase tracking-wider">
                [ कोणतीही नोंद सापडली नाही // NO MEMBER FOUND ]
              </div>
            ) : (
              searchResults.map((m) => {
                const isBlocked = m.consentWithdrawn;

                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={isBlocked}
                    onClick={() => {
                      if (!isBlocked) {
                        setSelectedMember(m);
                        setStep(2);
                      }
                    }}
                    className={`w-full min-h-[54px] text-left p-3.5 border-2 transition-all flex justify-between items-center group ${
                      isBlocked
                        ? "bg-red-50/70 border-red-300 opacity-70 cursor-not-allowed"
                        : "bg-chaos-paper border-chaos-black hover:bg-white hover:shadow-tactile hover:translate-y-[-1px] active:translate-y-0.5"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-sans font-black text-lg text-chaos-black">
                          {m.name}
                        </span>
                        {m.nameLatin && (
                          <span className="font-mono text-xs text-chaos-muted uppercase">
                            ({m.nameLatin})
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-xs text-chaos-muted flex items-center gap-2 mt-0.5">
                        <span className="bg-chaos-canvas border border-chaos-black/30 px-1.5 py-0.2 text-chaos-black font-bold">
                          {m.farmerCode}
                        </span>
                        <span>• गाव: {m.village}</span>
                      </div>
                    </div>

                    <div className="text-right flex flex-col items-end gap-1">
                      {isBlocked ? (
                        <span className="font-mono text-[10px] bg-red-600 text-white font-black px-2 py-0.5 uppercase tracking-wide">
                          संमती मागे घेतली
                        </span>
                      ) : m.bankVerified ? (
                        <span className="font-mono text-[10px] bg-emerald-100 text-emerald-900 border border-emerald-500 font-bold px-2 py-0.5 uppercase">
                          बँक खात्रीशीर ✓
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] bg-amber-100 text-amber-900 border border-amber-500 font-bold px-2 py-0.5 uppercase">
                          बँक अप्रमाणित
                        </span>
                      )}
                      <span className="font-mono text-xs font-bold text-chaos-black group-hover:text-chaos-orange transition-colors">
                        SELECT →
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </StepShell>
    );
  }

  // -------------------------------------------------------------------------
  // STEP 2: CROP & WEIGHTS (§13.2)
  // -------------------------------------------------------------------------
  if (step === 2) {
    return (
      <StepShell
        stepCurrent={2}
        stepTotal={4}
        title="पीक आणि वजन"
        isOnline={isOnline}
        onBack={() => setStep(1)}
      >
        <div className="flex flex-col gap-4">
          {/* Member Banner */}
          <div className="bg-chaos-paper border-2 border-chaos-black p-3 flex justify-between items-center text-xs">
            <div>
              <span className="font-mono text-chaos-muted uppercase tracking-wider block">
                निवडलेला शेतकरी (FARMER):
              </span>
              <span className="font-sans font-black text-base text-chaos-black">
                {selectedMember?.name}
              </span>
            </div>
            <span className="font-mono font-bold text-xs bg-chaos-black text-white px-2 py-1">
              {selectedMember?.farmerCode}
            </span>
          </div>

          {/* Crop Selector */}
          <div>
            <label className="font-mono text-xs font-bold uppercase tracking-wider text-chaos-muted block mb-1.5">
              पीक निवडा // SELECT COMMODITY:
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setCrop("Soybean")}
                className={`min-h-[56px] p-3 border-2 font-mono text-left transition-all ${
                  crop === "Soybean"
                    ? "bg-chaos-black text-white border-chaos-black shadow-tactile-orange translate-y-[-1px]"
                    : "bg-chaos-paper text-chaos-black border-chaos-black hover:bg-white"
                }`}
              >
                <div className="font-sans font-black text-base uppercase">सोयाबीन (Soybean)</div>
                <div className={`font-mono text-xs mt-0.5 ${crop === "Soybean" ? "text-chaos-orange font-bold" : "text-chaos-muted"}`}>
                  ₹{crop === "Soybean" ? rateRupees : 4850} / क्विंटल
                </div>
              </button>

              <button
                type="button"
                onClick={() => setCrop("Tur")}
                className={`min-h-[56px] p-3 border-2 font-mono text-left transition-all ${
                  crop === "Tur"
                    ? "bg-chaos-black text-white border-chaos-black shadow-tactile-orange translate-y-[-1px]"
                    : "bg-chaos-paper text-chaos-black border-chaos-black hover:bg-white"
                }`}
              >
                <div className="font-sans font-black text-base uppercase">तूर (Tur)</div>
                <div className={`font-mono text-xs mt-0.5 ${crop === "Tur" ? "text-chaos-orange font-bold" : "text-chaos-muted"}`}>
                  ₹{crop === "Tur" ? rateRupees : 7200} / क्विंटल
                </div>
              </button>
            </div>
          </div>

          {/* Gross & Tare Weight Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div
              onClick={() => setActiveInput("gross")}
              className={`p-3.5 border-2 cursor-pointer transition-all ${
                activeInput === "gross"
                  ? "bg-white border-chaos-black shadow-tactile-orange ring-1 ring-chaos-orange"
                  : "bg-chaos-paper border-chaos-black/40 hover:border-chaos-black"
              }`}
            >
              <label className="font-mono text-[11px] font-bold uppercase tracking-wider text-chaos-muted block">
                एकूण वजन (GROSS KG)
              </label>
              <span className="font-display font-black text-4xl sm:text-5xl text-chaos-black block mt-1 tracking-tight leading-none">
                {grossInput || "0.0"}
              </span>
            </div>

            <div
              onClick={() => setActiveInput("tare")}
              className={`p-3.5 border-2 cursor-pointer transition-all ${
                activeInput === "tare"
                  ? "bg-white border-chaos-black shadow-tactile-orange ring-1 ring-chaos-orange"
                  : "bg-chaos-paper border-chaos-black/40 hover:border-chaos-black"
              }`}
            >
              <label className="font-mono text-[11px] font-bold uppercase tracking-wider text-chaos-muted block">
                काटा वजन (TARE KG)
              </label>
              <span className="font-display font-black text-4xl sm:text-5xl text-chaos-black block mt-1 tracking-tight leading-none">
                {tareInput || "0.0"}
              </span>
            </div>
          </div>

          {/* Computed Net Weight Before Deduction */}
          <div className="bg-chaos-canvas border-2 border-chaos-black p-3 flex justify-between items-center text-xs">
            <span className="font-mono uppercase font-bold text-chaos-muted">
              कपातीपूर्वी निव्वळ वजन (GROSS - TARE):
            </span>
            <span className="font-mono text-base font-black text-chaos-black">
              {(beforeDeductionTenths / 10).toFixed(1)} KG
            </span>
          </div>

          {/* Scale Photo Placeholder (§13.2) */}
          <div className="flex justify-between items-center bg-chaos-paper p-3 border-2 border-chaos-black">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-chaos-black">
              [ 📷 काटा फोटो (SCALE PHOTO) ]
            </span>
            <button
              type="button"
              onClick={() => setScalePhotoAttached(!scalePhotoAttached)}
              className={`font-mono text-xs px-3 py-1.5 border-2 font-bold uppercase tracking-wider transition-all ${
                scalePhotoAttached
                  ? "bg-chaos-black text-chaos-orange border-chaos-black"
                  : "bg-chaos-canvas text-chaos-black border-chaos-black hover:bg-white"
              }`}
            >
              {scalePhotoAttached ? "PHOTO ATTACHED ✓" : "CAPTURE PHOTO"}
            </button>
          </div>

          {/* Numpad */}
          <Numpad
            onDigit={handleDigit}
            onClear={handleClear}
            onBackspace={handleBackspace}
          />

          {mathError && (
            <div className="border-2 border-red-600 bg-red-50 p-2 text-center font-mono text-xs font-bold text-red-700 uppercase tracking-wide">
              [!] {mathError}
            </div>
          )}

          {/* Next Button */}
          <Button
            variant="orange"
            disabled={grossTenths <= 0 || tareTenths >= grossTenths}
            onClick={() => {
              setActiveInput("moisture");
              setStep(3);
            }}
            className="w-full text-base py-3.5 shadow-tactile"
          >
            पुढे जा // NEXT: MOISTURE →
          </Button>
        </div>
      </StepShell>
    );
  }

  // -------------------------------------------------------------------------
  // STEP 3: MOISTURE CHECK (§11, §13.2)
  // -------------------------------------------------------------------------
  if (step === 3) {
    const moisturePermilleVal = moisturePermille(moistureTenths);
    const deductionPct = (moisturePermilleVal / 10).toFixed(1);

    const hasMismatch =
      aiReading?.valueX10 !== null &&
      aiReading?.valueX10 !== undefined &&
      moistureTenths !== aiReading.valueX10;

    const isBlockedByMismatch = hasMismatch && !mismatchConfirmed;

    return (
      <StepShell
        stepCurrent={3}
        stepTotal={4}
        title="ओलावा तपासणी"
        isOnline={isOnline}
        onBack={() => {
          setActiveInput("gross");
          setStep(2);
        }}
      >
        <div className="flex flex-col gap-4">
          {/* Member & Weight context */}
          <div className="bg-chaos-paper border-2 border-chaos-black p-3 flex justify-between items-center text-xs">
            <div>
              <span className="font-mono text-chaos-muted uppercase tracking-wider">शेतकरी: </span>
              <span className="font-sans font-black text-chaos-black">{selectedMember?.name}</span>
            </div>
            <div>
              <span className="font-mono text-chaos-muted uppercase tracking-wider">वजन: </span>
              <span className="font-mono font-black text-chaos-black">
                {(beforeDeductionTenths / 10).toFixed(1)} KG
              </span>
            </div>
          </div>

          {/* Moisture Input Display */}
          <div
            onClick={() => setActiveInput("moisture")}
            className="p-5 border-2 border-chaos-black bg-chaos-paper text-center shadow-tactile cursor-pointer"
          >
            <label className="font-mono text-xs font-bold uppercase tracking-wider text-chaos-muted block mb-1">
              ओलावा प्रमाण // MOISTURE PERCENTAGE
            </label>
            <span className="font-display font-black text-6xl text-chaos-black block my-1 tracking-tight leading-none">
              {moistureInput || "0.0"} <span className="text-3xl text-chaos-orange">%</span>
            </span>
            <span className="font-mono text-xs font-bold text-chaos-muted block mt-1">
              मानक मर्यादा (STANDARD BASE): 12.0%
            </span>
          </div>

          {/* Deduction Feedback Box */}
          <div
            className={`p-3.5 border-2 font-mono text-xs font-bold flex justify-between items-center ${
              moistureTenths <= 120
                ? "bg-emerald-50 border-emerald-600 text-emerald-900"
                : "bg-amber-50 border-chaos-orange text-amber-950"
            }`}
          >
            <div>
              <span className="uppercase text-chaos-muted">ओलावा कपात: </span>
              <span className="font-black">
                {moistureTenths <= 120 ? "०% (कपात नाही / ZERO DEDUCTION)" : `${deductionPct}% कपात`}
              </span>
            </div>
            <div>
              <span className="uppercase text-chaos-muted">वजन कपात: </span>
              <span className="font-black font-mono">
                {(deductionTenths / 10).toFixed(1)} KG
              </span>
            </div>
          </div>

          {/* Moisture Meter Photo Capture & AI Reading (§10.2) */}
          <div className="bg-chaos-paper border-2 border-chaos-black p-3.5 flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-chaos-black">
                📷 मीटर डिस्प्ले फोटो (LCD PHOTO):
              </span>
              <label
                htmlFor="meter-photo-input"
                className="cursor-pointer bg-chaos-canvas border-2 border-chaos-black text-chaos-black font-mono text-xs font-bold uppercase tracking-wider px-3 py-1.5 shadow-tactile-sm hover:bg-chaos-black hover:text-white transition-all"
              >
                {meterPhotoData ? "CHANGE PHOTO" : "CAPTURE PHOTO"}
              </label>
              <input
                id="meter-photo-input"
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoCapture}
              />
            </div>

            {isReadingPhoto && (
              <div className="font-mono text-xs text-chaos-orange font-bold bg-chaos-black p-2.5 flex items-center gap-2 border border-chaos-black">
                <span className="animate-spin inline-block">⏳</span> AI OCR LCD READING IN PROGRESS...
              </div>
            )}

            {meterPhotoData && !isReadingPhoto && (
              <div className="flex items-center gap-3 bg-white p-2 border-2 border-chaos-black">
                <img
                  src={meterPhotoData}
                  alt="Meter LCD"
                  className="w-16 h-12 object-cover border border-chaos-black"
                />
                <div className="font-mono text-xs">
                  {aiReading?.value !== null && aiReading?.value !== undefined ? (
                    <div>
                      <span className="font-bold text-emerald-800">
                        AI OCR READ: {aiReading.value}%
                      </span>{" "}
                      <span className="text-chaos-muted">
                        [{aiReading.confidence === "high" ? "HIGH CONFIDENCE" : "MEDIUM"}]
                      </span>
                      {aiReading.note && (
                        <span className="block text-chaos-muted text-[10px] mt-0.5">{aiReading.note}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-chaos-muted">PHOTO STORED FOR SYNC</span>
                  )}
                </div>
              </div>
            )}

            {photoNotice && (
              <div className="font-mono text-xs bg-chaos-canvas border border-chaos-black p-2 text-chaos-black font-medium">
                [i] {photoNotice}
              </div>
            )}
          </div>

          {/* Photo Mismatch Block (§10.2: Blocks saving until operator confirms) */}
          {hasMismatch && !mismatchConfirmed && (
            <div
              data-testid="mismatch-block"
              className="bg-amber-50 border-2 border-chaos-orange p-4 shadow-tactile-orange flex flex-col gap-2.5"
            >
              <div className="flex items-center gap-2 text-amber-950 font-mono font-black text-xs uppercase tracking-wider">
                <span>⚠️</span>
                <span>वाचन विसंगती // READING MISMATCH DETECTED</span>
              </div>
              <p className="font-sans text-xs text-stone-800 font-medium">
                AI ने वाचलेले मूल्य <b>{(aiReading!.valueX10! / 10).toFixed(1)}%</b> आहे आणि आपण टाइप केलेले मूल्य <b>{(moistureTenths / 10).toFixed(1)}%</b> आहे. पुढे जाण्यासाठी खालीलपैकी एक पर्याय निवडा:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  data-testid="btn-use-ai-reading"
                  onClick={() => {
                    setMoistureInput((aiReading!.valueX10! / 10).toFixed(1));
                    setMismatchConfirmed(true);
                  }}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-mono text-xs font-bold py-2.5 px-3 uppercase border-2 border-chaos-black shadow-tactile-sm transition-all"
                >
                  ✓ USE AI ({(aiReading!.valueX10! / 10).toFixed(1)}%)
                </button>
                <button
                  type="button"
                  data-testid="btn-confirm-typed-reading"
                  onClick={() => setMismatchConfirmed(true)}
                  className="bg-chaos-black hover:bg-stone-800 text-white font-mono text-xs font-bold py-2.5 px-3 uppercase border-2 border-chaos-black shadow-tactile-sm transition-all"
                >
                  ✓ USE TYPED ({(moistureTenths / 10).toFixed(1)}%)
                </button>
              </div>
            </div>
          )}

          {/* Numpad (Manual Fallback §10.2) */}
          <Numpad
            onDigit={(d) => {
              handleDigit(d);
              setMismatchConfirmed(false);
            }}
            onClear={() => {
              handleClear();
              setMismatchConfirmed(false);
            }}
            onBackspace={() => {
              handleBackspace();
              setMismatchConfirmed(false);
            }}
          />

          {/* Next Button - Blocked when mismatch is unresolved (§10.2) */}
          <Button
            variant="orange"
            disabled={isBlockedByMismatch || moistureTenths <= 0}
            onClick={() => setStep(4)}
            className="w-full text-base py-3.5 shadow-tactile"
          >
            {isBlockedByMismatch
              ? "⚠️ विसंगती निश्चित करा // RESOLVE MISMATCH"
              : "पुढे जा // NEXT: SUMMARY →"}
          </Button>
        </div>
      </StepShell>
    );
  }

  // -------------------------------------------------------------------------
  // STEP 4: SUMMARY SCREEN (§13.1, §13.2)
  // -------------------------------------------------------------------------
  return (
    <StepShell
      stepCurrent={4}
      stepTotal={4}
      title="तपशील पडताळणी"
      isOnline={isOnline}
      onBack={() => setStep(3)}
    >
      <div className="flex flex-col gap-4">
        {saveError && (
          <div className="p-3 bg-red-100 border-2 border-red-600 text-red-900 font-mono text-xs font-bold uppercase tracking-wide">
            [!] {saveError}
          </div>
        )}

        {/* Farmer Info Card */}
        <div className="bg-chaos-paper border-2 border-chaos-black p-4 shadow-tactile">
          <div className="flex justify-between items-start">
            <div>
              <span className="font-mono text-xs text-chaos-muted uppercase tracking-wider block">
                शेतकरी तपशील // FARMER IDENTITY
              </span>
              <p className="font-sans text-xl font-black text-chaos-black mt-0.5">{selectedMember?.name}</p>
              <p className="font-mono text-xs text-chaos-muted mt-0.5">
                गाव: {selectedMember?.village} • कोड: {selectedMember?.farmerCode}
              </p>
            </div>
            <div className="text-right">
              <span className="font-mono text-xs bg-chaos-black text-chaos-orange font-bold px-2.5 py-1 uppercase tracking-wider border border-chaos-black">
                {crop === "Soybean" ? "सोयाबीन" : "तूर"} ({grade})
              </span>
            </div>
          </div>

          {selectedMember?.consentWithdrawn && (
            <p className="font-mono text-xs font-bold text-red-900 bg-red-100 p-2.5 mt-3 border-2 border-red-400">
              [!] संमती मागे घेतली: या सभासदाने DPDP कायद्यांतर्गत संमती मागे घेतली आहे. खरेदी नोंदवता येणार नाही.
            </p>
          )}

          {!selectedMember?.consentWithdrawn && !selectedMember?.bankVerified && (
            <p className="font-mono text-xs font-bold text-amber-900 bg-amber-50 p-2 mt-3 border border-amber-300">
              [i] बँक खाते अद्याप पडताळलेले नाही. पेमेंटपूर्वी पडताळणी होईल.
            </p>
          )}
        </div>

        {/* Calculation Details Table */}
        <div className="bg-white border-2 border-chaos-black p-4 flex flex-col gap-2.5 font-mono text-xs shadow-tactile-sm">
          <div className="flex justify-between text-chaos-muted uppercase">
            <span>एकूण वजन (GROSS WEIGHT):</span>
            <span className="font-black text-chaos-black">{(grossTenths / 10).toFixed(1)} KG</span>
          </div>

          <div className="flex justify-between text-chaos-muted uppercase">
            <span>काटा वजन (TARE WEIGHT):</span>
            <span className="font-black text-chaos-black">{(tareTenths / 10).toFixed(1)} KG</span>
          </div>

          <div className="flex justify-between text-chaos-muted uppercase border-t border-dashed border-stone-300 pt-2">
            <span>कपातीपूर्वी निव्वळ (BEFORE DEDUCTION):</span>
            <span className="font-black text-chaos-black">{(beforeDeductionTenths / 10).toFixed(1)} KG</span>
          </div>

          <div className="flex justify-between text-chaos-muted uppercase">
            <span>ओलावा ({ (moistureTenths / 10).toFixed(1) }%) कपात:</span>
            <span className="font-black text-red-600">- {(deductionTenths / 10).toFixed(1)} KG</span>
          </div>

          <div className="flex justify-between text-chaos-black border-t-2 border-chaos-black pt-2 text-sm font-black uppercase">
            <span>निव्वळ देय वजन (NET BILLABLE):</span>
            <span className="text-chaos-orange font-mono">{(netTenths / 10).toFixed(1)} KG</span>
          </div>

          <div className="flex justify-between text-chaos-muted uppercase border-t border-dashed border-stone-300 pt-2">
            <span>दर (PRICE PER QUINTAL):</span>
            <span className="font-black text-chaos-black">₹{rateRupees} / QTL</span>
          </div>
        </div>

        {/* AMOUNT HERO - Monumental Brutalist Element (§13.1) */}
        <div className="bg-chaos-paper border-2 border-chaos-black p-5 text-center shadow-tactile-lg">
          <span className="font-mono text-xs font-bold text-chaos-muted uppercase tracking-widest block">
            एकूण देय रक्कम // TOTAL PAYABLE DISBURSEMENT
          </span>
          <span className="font-display font-black text-5xl sm:text-6xl text-chaos-black tracking-tight block my-1">
            {formatRupees(amountPaiseValue)}
          </span>
          <span className="font-mono text-xs font-bold text-chaos-orange block uppercase tracking-wider">
            ✓ ४८ तासांत बँक खात्यावर थेट जमा (DBT WITHIN 48H)
          </span>
        </div>

        {/* Save Purchase Button */}
        <Button
          variant="orange"
          disabled={isSaving || netTenths <= 0 || !!selectedMember?.consentWithdrawn}
          onClick={handleSavePurchase}
          className="w-full text-lg py-4 font-black shadow-tactile-lg min-h-[56px] disabled:opacity-50"
        >
          {isSaving ? "खरेदी साठवत आहे..." : "✓ खरेदी साठवा // CONFIRM & PRINT SLIP"}
        </Button>
      </div>
    </StepShell>
  );
}
