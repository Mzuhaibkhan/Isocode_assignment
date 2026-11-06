import { useState, useEffect } from "react";
import { db, CachedMember, CachedPrice } from "../../offline/db.js";
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

  // Photos (simulated attachments for Phase 5)
  const [scalePhotoAttached, setScalePhotoAttached] = useState<boolean>(false);
  const [meterPhotoAttached, setMeterPhotoAttached] = useState<boolean>(false);

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

  // Submit Purchase
  const handleSavePurchase = async () => {
    if (!selectedMember) return;
    setIsSaving(true);
    setSaveError(null);

    const payload = {
      memberId: selectedMember.id,
      crop,
      grade,
      grossX10: grossTenths,
      tareX10: tareTenths,
      moistureX10: moistureTenths,
      claimedNetX10: netTenths,
      claimedAmountPaise: amountPaiseValue,
      ratePaise,
      priceVersion,
      centreCode: "C07",
    };

    try {
      const res = await fetch("/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || "खरेदी साठवताना त्रुटी आली");
      }

      setCreatedSlip({
        slipNo: data.slip.slipNo,
        farmerName: selectedMember.name,
        crop: crop === "Soybean" ? "सोयाबीन" : "तूर",
        netKg: data.slip.netKg,
        moisturePercent: data.slip.moisturePercent,
        ratePerQuintal: data.slip.ratePerQuintal,
        amountPaise: data.slip.amountPaise,
        smsStatus: data.slip.smsStatus || "sent",
      });

      setStep(5);
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSelectedMember(null);
    setGrossInput("1250.0");
    setTareInput("18.0");
    setMoistureInput("11.5");
    setScalePhotoAttached(false);
    setMeterPhotoAttached(false);
    setSaveError(null);
    setCreatedSlip(null);
    setStep(1);
  };

  // -------------------------------------------------------------------------
  // STEP 5: SLIP VIEW (§11)
  // -------------------------------------------------------------------------
  if (step === 5 && createdSlip) {
    return (
      <div className="min-h-screen bg-bg-main py-6 px-3 flex flex-col justify-center items-center">
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
        priceDate={`दर आवृत्ती: v${priceVersion}`}
      >
        <div className="flex flex-col gap-3">
          {/* Search Bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="नाव, आडनाव, गाव किंवा कोडने शोधा..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full min-h-touch px-4 py-3 text-base border-2 border-stone-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-3 text-stone-500 font-bold px-2 py-1"
              >
                ✕
              </button>
            )}
          </div>

          <p className="text-xs font-bold text-text-muted">
            सभासद यादी (नाव टॅप करा):
          </p>

          {/* Members List */}
          <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto pr-1">
            {searchResults.length === 0 ? (
              <div className="text-center py-8 text-stone-500 bg-white rounded-xl border border-dashed border-stone-300">
                कोणताही सभासद सापडला नाही
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
                    className={`w-full min-h-touch text-left p-3.5 rounded-xl border-2 transition-all flex justify-between items-center ${
                      isBlocked
                        ? "bg-red-50 border-red-300 opacity-70 cursor-not-allowed"
                        : "bg-white border-stone-800 hover:border-brand active:bg-stone-50 shadow-sm"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-stone-900">
                          {m.name}
                        </span>
                        {m.nameLatin && (
                          <span className="text-xs text-stone-500 font-semibold">
                            ({m.nameLatin})
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-stone-600 font-semibold flex items-center gap-2 mt-0.5">
                        <span className="font-mono bg-stone-100 px-1.5 py-0.5 rounded">
                          {m.farmerCode}
                        </span>
                        <span>• गाव: {m.village}</span>
                      </div>
                    </div>

                    <div className="text-right flex flex-col items-end gap-1">
                      {isBlocked ? (
                        <span className="text-[10px] bg-red-600 text-white font-black px-2 py-0.5 rounded">
                          संमती मागे घेतली
                        </span>
                      ) : m.bankVerified ? (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded border border-emerald-300">
                          बँक खात्रीशीर ✓
                        </span>
                      ) : (
                        <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded border border-amber-300">
                          बँक अप्रमाणित
                        </span>
                      )}
                      <span className="text-xs font-bold text-stone-400">
                        निवडा →
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
          <div className="bg-stone-100 p-2.5 rounded-xl border border-stone-300 flex justify-between items-center text-xs">
            <div>
              <span className="text-text-muted font-bold">सभासद: </span>
              <span className="font-black text-stone-900 text-sm">
                {selectedMember?.name}
              </span>
            </div>
            <span className="font-mono bg-white px-2 py-0.5 rounded border border-stone-200">
              {selectedMember?.farmerCode}
            </span>
          </div>

          {/* Crop Selector */}
          <div>
            <label className="text-xs font-black uppercase tracking-wider text-text-muted block mb-1.5">
              पीक निवडा:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCrop("Soybean")}
                className={`min-h-touch p-3 rounded-xl border-2 font-black text-sm flex flex-col items-center justify-center transition-all ${
                  crop === "Soybean"
                    ? "bg-stone-900 text-white border-stone-900 shadow-md"
                    : "bg-white text-stone-800 border-stone-300 hover:border-stone-400"
                }`}
              >
                <span>सोयाबीन (Soybean)</span>
                <span className="text-xs font-bold text-emerald-400">
                  ₹{crop === "Soybean" ? rateRupees : 4850} / क्विंटल
                </span>
              </button>

              <button
                type="button"
                onClick={() => setCrop("Tur")}
                className={`min-h-touch p-3 rounded-xl border-2 font-black text-sm flex flex-col items-center justify-center transition-all ${
                  crop === "Tur"
                    ? "bg-stone-900 text-white border-stone-900 shadow-md"
                    : "bg-white text-stone-800 border-stone-300 hover:border-stone-400"
                }`}
              >
                <span>तूर (Tur)</span>
                <span className="text-xs font-bold text-emerald-400">
                  ₹{crop === "Tur" ? rateRupees : 7200} / क्विंटल
                </span>
              </button>
            </div>
          </div>

          {/* Gross & Tare Weight Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div
              onClick={() => setActiveInput("gross")}
              className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                activeInput === "gross"
                  ? "bg-amber-50/50 border-amber-600 ring-2 ring-amber-400"
                  : "bg-white border-stone-300"
              }`}
            >
              <label className="text-xs font-black text-stone-600 block">
                एकूण वजन (Gross kg)
              </label>
              <span className="text-2xl font-black text-stone-950 block mt-1">
                {grossInput || "0.0"}
              </span>
            </div>

            <div
              onClick={() => setActiveInput("tare")}
              className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                activeInput === "tare"
                  ? "bg-amber-50/50 border-amber-600 ring-2 ring-amber-400"
                  : "bg-white border-stone-300"
              }`}
            >
              <label className="text-xs font-black text-stone-600 block">
                काटा वजन (Tare kg)
              </label>
              <span className="text-2xl font-black text-stone-950 block mt-1">
                {tareInput || "0.0"}
              </span>
            </div>
          </div>

          {/* Computed Net Weight Before Deduction */}
          <div className="bg-stone-50 border border-stone-300 p-2.5 rounded-xl flex justify-between items-center text-xs">
            <span className="font-bold text-stone-600">कपातीपूर्वी वजन (Gross - Tare):</span>
            <span className="text-base font-black text-stone-900">
              {(beforeDeductionTenths / 10).toFixed(1)} किग्रॅ
            </span>
          </div>

          {/* Scale Photo Placeholder (§13.2) */}
          <div className="flex justify-between items-center bg-stone-100 p-2.5 rounded-xl border border-stone-200">
            <span className="text-xs font-bold text-stone-700">
              📷 काटा फोटो (Scale Photo):
            </span>
            <button
              type="button"
              onClick={() => setScalePhotoAttached(!scalePhotoAttached)}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold border ${
                scalePhotoAttached
                  ? "bg-emerald-600 text-white border-emerald-700"
                  : "bg-white text-stone-800 border-stone-300"
              }`}
            >
              {scalePhotoAttached ? "फोटो जोडला ✓" : "कॅमेरा उघडा"}
            </button>
          </div>

          {/* Numpad */}
          <Numpad
            onDigit={handleDigit}
            onClear={handleClear}
            onBackspace={handleBackspace}
          />

          {mathError && (
            <p className="text-xs font-black text-red-600 text-center">
              ⚠️ {mathError}
            </p>
          )}

          {/* Next Button */}
          <Button
            variant="primary"
            disabled={grossTenths <= 0 || tareTenths >= grossTenths}
            onClick={() => {
              setActiveInput("moisture");
              setStep(3);
            }}
            className="w-full text-base py-3.5"
          >
            पुढे जा (Next: Moisture) →
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
          <div className="bg-stone-100 p-2.5 rounded-xl border border-stone-300 flex justify-between items-center text-xs">
            <div>
              <span className="text-text-muted font-bold">शेतकरी: </span>
              <span className="font-black text-stone-900">{selectedMember?.name}</span>
            </div>
            <div>
              <span className="text-text-muted font-bold">वजन: </span>
              <span className="font-black text-stone-900">
                {(beforeDeductionTenths / 10).toFixed(1)} किग्रॅ
              </span>
            </div>
          </div>

          {/* Moisture Input Display */}
          <div
            onClick={() => setActiveInput("moisture")}
            className="p-4 rounded-xl border-2 border-amber-600 bg-amber-50/40 text-center"
          >
            <label className="text-xs font-black uppercase tracking-wider text-stone-700 block mb-1">
              ओलावा प्रमाण (Moisture %)
            </label>
            <span className="text-5xl font-black text-stone-950 block my-1">
              {moistureInput || "0.0"} %
            </span>
            <span className="text-xs font-bold text-stone-500 block">
              मानक मर्यादा: १२.०% (Base: 12.0%)
            </span>
          </div>

          {/* Deduction Feedback Box */}
          <div
            className={`p-3 rounded-xl border-2 text-xs font-bold flex justify-between items-center ${
              moistureTenths <= 120
                ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                : "bg-amber-50 border-amber-300 text-amber-900"
            }`}
          >
            <div>
              <span>ओलावा कपात: </span>
              <span className="font-black">
                {moistureTenths <= 120 ? "०% (कपात नाही)" : `${deductionPct}% कपात`}
              </span>
            </div>
            <div>
              <span>वजन कपात: </span>
              <span className="font-black">
                {(deductionTenths / 10).toFixed(1)} किग्रॅ
              </span>
            </div>
          </div>

          {/* Moisture Meter Photo Placeholder (§13.2) */}
          <div className="flex justify-between items-center bg-stone-100 p-2.5 rounded-xl border border-stone-200">
            <span className="text-xs font-bold text-stone-700">
              📷 ओलावा मीटर फोटो (Meter Photo):
            </span>
            <button
              type="button"
              onClick={() => setMeterPhotoAttached(!meterPhotoAttached)}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold border ${
                meterPhotoAttached
                  ? "bg-emerald-600 text-white border-emerald-700"
                  : "bg-white text-stone-800 border-stone-300"
              }`}
            >
              {meterPhotoAttached ? "फोटो जोडला ✓" : "कॅमेरा उघडा"}
            </button>
          </div>

          {/* Numpad */}
          <Numpad
            onDigit={handleDigit}
            onClear={handleClear}
            onBackspace={handleBackspace}
          />

          {/* Next Button */}
          <Button
            variant="primary"
            disabled={moistureTenths < 0}
            onClick={() => setStep(4)}
            className="w-full text-base py-3.5"
          >
            पुढे जा (Next: Summary) →
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
        {/* Error Alert if any */}
        {saveError && (
          <div className="p-3 bg-red-100 border-2 border-red-400 rounded-xl text-red-900 text-xs font-bold">
            ⚠️ {saveError}
          </div>
        )}

        {/* Farmer Info Card */}
        <div className="bg-stone-100 p-3.5 rounded-xl border border-stone-300">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs text-stone-500 font-bold block">शेतकरी</span>
              <p className="text-lg font-black text-stone-900">{selectedMember?.name}</p>
              <p className="text-xs text-stone-600">
                गाव: {selectedMember?.village} • कोड: {selectedMember?.farmerCode}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs bg-stone-900 text-white font-bold px-2 py-0.5 rounded">
                {crop === "Soybean" ? "सोयाबीन" : "तूर"} ({grade})
              </span>
            </div>
          </div>

          {!selectedMember?.bankVerified && (
            <p className="text-[11px] font-bold text-amber-800 bg-amber-50 p-1.5 rounded mt-2 border border-amber-200">
              ⚠️ बँक खाते अद्याप पडताळलेले नाही. पेमेंटपूर्वी पडताळणी होईल.
            </p>
          )}
        </div>

        {/* Calculation Details Table */}
        <div className="bg-white border-2 border-stone-800 rounded-xl p-3.5 flex flex-col gap-2.5 text-xs">
          <div className="flex justify-between text-stone-700">
            <span>एकूण वजन (Gross):</span>
            <span className="font-bold text-stone-900">{(grossTenths / 10).toFixed(1)} किग्रॅ</span>
          </div>

          <div className="flex justify-between text-stone-700">
            <span>काटा वजन (Tare):</span>
            <span className="font-bold text-stone-900">{(tareTenths / 10).toFixed(1)} किग्रॅ</span>
          </div>

          <div className="flex justify-between text-stone-700 border-t border-stone-200 pt-1.5">
            <span>कपातीपूर्वी निव्वळ:</span>
            <span className="font-bold text-stone-900">{(beforeDeductionTenths / 10).toFixed(1)} किग्रॅ</span>
          </div>

          <div className="flex justify-between text-stone-700">
            <span>ओलावा ({ (moistureTenths / 10).toFixed(1) }%) कपात:</span>
            <span className="font-bold text-red-700">- {(deductionTenths / 10).toFixed(1)} किग्रॅ</span>
          </div>

          <div className="flex justify-between text-stone-900 border-t-2 border-stone-300 pt-2 text-sm font-black">
            <span>निव्वळ देय वजन (Net):</span>
            <span className="text-brand">{(netTenths / 10).toFixed(1)} किग्रॅ</span>
          </div>

          <div className="flex justify-between text-stone-700 border-t border-stone-200 pt-1.5">
            <span>दर (प्रति क्विंटल):</span>
            <span className="font-bold text-stone-900">₹{rateRupees} / क्विंटल</span>
          </div>
        </div>

        {/* AMOUNT HERO - Largest element on screen (§13.1) */}
        <div className="bg-emerald-50 border-2 border-emerald-600 p-4 rounded-xl text-center shadow">
          <span className="text-xs font-black text-emerald-800 uppercase tracking-wider block">
            एकूण देय रक्कम (Payable Amount)
          </span>
          <span className="text-4xl sm:text-5xl font-black text-stone-950 tracking-tight block my-1">
            {formatRupees(amountPaiseValue)}
          </span>
          <span className="text-xs font-bold text-emerald-800 block">
            ४८ तासांत बँक खात्यावर जमा होतील
          </span>
        </div>

        {/* Save Purchase Button */}
        <Button
          variant="primary"
          disabled={isSaving || netTenths <= 0}
          onClick={handleSavePurchase}
          className="w-full text-lg py-4 font-black shadow-lg min-h-touch bg-brand"
        >
          {isSaving ? "खरेदी साठवत आहे..." : "✓ खरेदी साठवा (Save Purchase)"}
        </Button>
      </div>
    </StepShell>
  );
}
