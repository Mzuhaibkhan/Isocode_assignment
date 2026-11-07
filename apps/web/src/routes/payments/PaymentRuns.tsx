import { useState, useEffect } from "react";
import { formatRupees } from "@procurement/shared";
import { Button } from "../../ui/Button.js";

interface EligiblePurchase {
  id: string;
  slipNo: string;
  memberId: string;
  farmerName: string;
  farmerCode: string;
  crop: string;
  netKg: number;
  amountRupees: number;
  amountPaise: number;
  clientTime: string;
}

interface PaymentRunSummary {
  id: string;
  kind: "standard" | "retry";
  parentRunId?: string | null;
  totalFarmers: number;
  totalAmountPaise: number;
  status: string;
  createdByName: string;
  createdAt: string;
}

interface PaymentItem {
  id: string;
  farmerName: string;
  accountMasked: string;
  ifsc: string;
  amountPaise: number;
  amountRupees: number;
  slipNumbers: string[];
  status: "queued" | "sent" | "success" | "failed";
  bankRef?: string | null;
  failureReason?: string | null;
  retryOfItemId?: string | null;
  retriedByItemId?: string | null;
}

interface PaymentRunDetail {
  run: PaymentRunSummary;
  items: PaymentItem[];
}

export function PaymentRuns() {
  const [activeSubTab, setActiveSubTab] = useState<"eligible" | "runs">("eligible");

  // Eligible purchases state
  const [eligible, setEligible] = useState<EligiblePurchase[]>([]);
  const [loadingEligible, setLoadingEligible] = useState(false);
  const [selectedPurchaseIds, setSelectedPurchaseIds] = useState<Set<string>>(new Set());
  const [creatingRun, setCreatingRun] = useState(false);

  // Runs history & detail state
  const [runs, setRuns] = useState<PaymentRunSummary[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<PaymentRunDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Notice/Alerts
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 1. Fetch eligible purchases
  const fetchEligible = async () => {
    try {
      setLoadingEligible(true);
      setError(null);
      const res = await fetch("/api/payment-runs/eligible-purchases");
      if (!res.ok) throw new Error(`सर्व्हर त्रुटी: ${res.status}`);
      const data = await res.json();
      setEligible(data.eligiblePurchases || []);
      const ids = new Set<string>((data.eligiblePurchases || []).map((p: any) => p.id));
      setSelectedPurchaseIds(ids);
    } catch (err: any) {
      setError(err.message || "पात्र खरेदी यादी लोड करता आली नाही");
    } finally {
      setLoadingEligible(false);
    }
  };

  // 2. Fetch payment runs list
  const fetchRuns = async () => {
    try {
      setLoadingRuns(true);
      setError(null);
      const res = await fetch("/api/payment-runs");
      if (!res.ok) throw new Error(`सर्व्हर त्रुटी: ${res.status}`);
      const data = await res.json();
      setRuns(data.runs || []);
      if (!selectedRunId && data.runs?.length > 0) {
        setSelectedRunId(data.runs[0].id);
      }
    } catch (err: any) {
      setError(err.message || "पेमेंट रन्स यादी लोड करता आली नाही");
    } finally {
      setLoadingRuns(false);
    }
  };

  // 3. Fetch single run detail
  const fetchRunDetail = async (runId: string) => {
    try {
      setLoadingDetail(true);
      const res = await fetch(`/api/payment-runs/${runId}`);
      if (!res.ok) throw new Error(`सर्व्हर त्रुटी: ${res.status}`);
      const data = await res.json();
      setRunDetail(data);
    } catch (err: any) {
      setError(err.message || "पेमेंट रन तपशील लोड करता आला नाही");
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === "eligible") {
      fetchEligible();
    } else {
      fetchRuns();
    }
  }, [activeSubTab]);

  useEffect(() => {
    if (selectedRunId) {
      fetchRunDetail(selectedRunId);
    }
  }, [selectedRunId]);

  // Create payment run (§12)
  const handleCreateRun = async () => {
    if (selectedPurchaseIds.size === 0) {
      alert("कृपया किमान एक खरेदी निवडा");
      return;
    }

    try {
      setCreatingRun(true);
      setError(null);
      const res = await fetch("/api/payment-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseIds: Array.from(selectedPurchaseIds),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "पेमेंट रन तयार करता आला नाही");
      }

      const result = await res.json();
      setNotice(
        `पेमेंट रन ${result.runId} यशस्वीरित्या तयार झाला! एकूण शेतकरी: ${result.totalFarmers}, रक्कम: ${formatRupees(
          result.totalAmountPaise
        )}.`
      );
      setSelectedRunId(result.runId);
      setActiveSubTab("runs");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreatingRun(false);
    }
  };

  // Simulate bank status update (§17 step 7)
  const handleSimulateStatus = async (outcome: "all_success" | "one_failed") => {
    if (!runDetail) return;
    try {
      const itemsToUpdate = runDetail.items.map((item, idx) => {
        if (outcome === "one_failed" && idx === 0) {
          return {
            itemId: item.id,
            status: "failed" as const,
            failureReason: "बँक खाते क्रमांक विसंगत (Account inactive / Invalid IFSC)",
          };
        }
        return {
          itemId: item.id,
          status: "success" as const,
          bankRef: `UTR${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        };
      });

      const res = await fetch(`/api/payment-runs/${runDetail.run.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsToUpdate }),
      });

      if (!res.ok) throw new Error("स्थिती अद्यतनित करता आली नाही");
      setNotice("बँक प्रतिसाद यशस्वीरित्या अद्यतनित करण्यात आला.");
      await fetchRunDetail(runDetail.run.id);
      await fetchRuns();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Retry failed payments (§12 new-run model)
  const handleRetryFailed = async () => {
    if (!runDetail) return;
    try {
      setNotice("अयशस्वी देयकांसाठी नवीन रन तयार केला जात आहे...");
      const res = await fetch(`/api/payment-runs/${runDetail.run.id}/retry-failed`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "पुन्हा प्रयत्न करता आला नाही");
      }

      const body = await res.json();
      setNotice(`नवीन रीट्राय रन (${body.retryRunId}) तयार झाला!`);
      setSelectedRunId(body.retryRunId);
      await fetchRuns();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedPurchaseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedEligible = eligible.filter((p) => selectedPurchaseIds.has(p.id));
  const selectedTotalPaise = selectedEligible.reduce((acc, p) => acc + p.amountPaise, 0);
  const selectedUniqueFarmers = new Set(selectedEligible.map((p) => p.memberId)).size;

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto p-1 font-sans">
      {/* Top Brutalist Masthead */}
      <div className="bg-chaos-paper border-2 border-chaos-black p-6 shadow-tactile flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs uppercase font-bold text-chaos-orange tracking-widest">
              DIRECT BENEFIT DISBURSEMENT // देयक फाईल
            </span>
            <span className="font-mono text-[10px] bg-chaos-black text-white px-2 py-0.5 uppercase tracking-wider">
              BANK CSV EXPORT
            </span>
          </div>
          <h2 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight text-chaos-black">
            शेतकरी बँक देयक व पेमेंट फाईल (PAYMENT RUNS)
          </h2>
          <p className="font-mono text-xs uppercase tracking-wider text-chaos-muted mt-1">
            IMMUTABLE SNAPSHOT BATCH DISBURSEMENT ENGINE (§12)
          </p>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveSubTab("eligible")}
            className={`min-h-[44px] px-4 py-2 border-2 font-mono text-xs uppercase font-bold tracking-wider transition-all ${
              activeSubTab === "eligible"
                ? "bg-chaos-black text-white border-chaos-black shadow-tactile-orange translate-y-[-1px]"
                : "bg-chaos-canvas text-chaos-black border-chaos-black hover:bg-white"
            }`}
          >
            01. पात्र खरेदी [ELIGIBLE]
          </button>
          <button
            onClick={() => setActiveSubTab("runs")}
            className={`min-h-[44px] px-4 py-2 border-2 font-mono text-xs uppercase font-bold tracking-wider transition-all ${
              activeSubTab === "runs"
                ? "bg-chaos-black text-white border-chaos-black shadow-tactile-orange translate-y-[-1px]"
                : "bg-chaos-canvas text-chaos-black border-chaos-black hover:bg-white"
            }`}
          >
            02. रन्स इतिहास [HISTORY]
          </button>
        </div>
      </div>

      {notice && (
        <div className="bg-emerald-50 border-2 border-emerald-600 text-emerald-950 font-mono text-xs font-bold p-3.5 shadow-tactile-sm flex justify-between items-center uppercase tracking-wide">
          <span>✓ {notice}</span>
          <button
            onClick={() => setNotice(null)}
            className="font-mono text-xs text-chaos-muted hover:text-chaos-black font-black ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-2 border-red-600 text-red-900 font-mono text-xs font-bold p-3.5 shadow-tactile-sm uppercase tracking-wide">
          [!] {error}
        </div>
      )}

      {/* SUB-TAB 1: ELIGIBLE PURCHASES */}
      {activeSubTab === "eligible" && (
        <div className="flex flex-col gap-5">
          {/* Summary Box & Create Button */}
          <div className="bg-chaos-black text-chaos-canvas border-2 border-chaos-black p-6 shadow-tactile-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <span className="font-mono text-xs font-bold text-chaos-orange uppercase tracking-widest block">
                निवडलेल्या खरेदीचा सारांश // SELECTION SUMMARY
              </span>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="font-display font-black text-4xl sm:text-5xl text-white tracking-tight">
                  {formatRupees(selectedTotalPaise)}
                </span>
                <span className="font-mono text-xs text-chaos-muted uppercase">
                  ({selectedUniqueFarmers} FARMERS • {selectedEligible.length} SLIPS)
                </span>
              </div>
            </div>

            <Button
              variant="orange"
              disabled={creatingRun || selectedEligible.length === 0}
              onClick={handleCreateRun}
              className="shadow-tactile-sm whitespace-nowrap text-sm py-3 px-6 font-mono font-bold uppercase"
            >
              {creatingRun ? "GEN RUN..." : "📄 तयार करा // GENERATE PAYMENT RUN"}
            </Button>
          </div>

          {loadingEligible ? (
            <div className="p-12 text-center text-chaos-muted font-mono text-xs uppercase tracking-wider bg-chaos-paper border-2 border-dashed border-chaos-black/40">
              [ ⏳ देयकासाठी पात्र नोंदी शोधत आहे // QUERYING ELIGIBLE PURCHASES... ]
            </div>
          ) : eligible.length === 0 ? (
            <div className="p-12 text-center bg-chaos-paper border-2 border-dashed border-chaos-black/40 shadow-tactile flex flex-col items-center gap-2">
              <span className="font-display font-black text-3xl uppercase tracking-tight text-chaos-black">
                NO PENDING ELIGIBLE PURCHASES
              </span>
              <p className="font-mono text-xs text-chaos-muted uppercase tracking-wider">
                देयकासाठी सध्या कोणतीही नवीन मंजूर खरेदी उपलब्ध नाही • ALL BATCHES PROCESSED
              </p>
            </div>
          ) : (
            <div className="bg-chaos-paper border-2 border-chaos-black shadow-tactile overflow-hidden">
              <div className="p-3.5 bg-chaos-canvas border-b-2 border-chaos-black flex justify-between items-center font-mono text-xs font-bold text-chaos-black uppercase tracking-wider">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedPurchaseIds.size === eligible.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPurchaseIds(new Set(eligible.map((p) => p.id)));
                      } else {
                        setSelectedPurchaseIds(new Set());
                      }
                    }}
                    className="w-4 h-4 rounded-none border-2 border-chaos-black text-chaos-black accent-chaos-orange cursor-pointer"
                  />
                  <span>SELECT ALL ({eligible.length})</span>
                </label>
                <span>पावती व शेतकरी तपशील</span>
                <span>रक्कम (AMOUNT)</span>
              </div>

              <div className="divide-y border-chaos-black/20">
                {eligible.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => toggleSelect(p.id)}
                    className="p-3.5 flex items-center justify-between gap-3 hover:bg-white cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedPurchaseIds.has(p.id)}
                        onChange={() => {}}
                        className="w-4 h-4 rounded-none border-2 border-chaos-black text-chaos-black accent-chaos-orange pointer-events-none"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-sans font-black text-chaos-black text-base">{p.farmerName}</span>
                          <span className="font-mono text-xs font-bold bg-chaos-canvas border border-chaos-black/30 px-1.5 py-0.2">
                            {p.farmerCode}
                          </span>
                        </div>
                        <span className="font-mono text-xs text-chaos-muted uppercase mt-0.5 block">
                          पावती: <b>{p.slipNo}</b> • {p.crop} ({(p.netKg).toFixed(1)} KG)
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="font-display font-black text-xl text-chaos-black">
                        {formatRupees(p.amountPaise)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: PAYMENT RUNS HISTORY & DETAIL */}
      {activeSubTab === "runs" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left: Runs List */}
          <div className="lg:col-span-1 flex flex-col gap-2.5">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-chaos-muted px-1">
              पेमेंट रन्स यादी // RUNS ARCHIVE ({runs.length})
            </span>

            {loadingRuns ? (
              <div className="p-8 text-center font-mono text-xs uppercase text-chaos-muted bg-chaos-paper border-2 border-dashed border-chaos-black/40">
                [ ⏳ रन्स लोड होत आहेत... ]
              </div>
            ) : runs.length === 0 ? (
              <div className="p-8 text-center font-mono text-xs uppercase text-chaos-muted bg-chaos-paper border-2 border-dashed border-chaos-black/40">
                [ अद्याप कोणताही पेमेंट रन तयार केलेला नाही ]
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {runs.map((r) => {
                  const isSelected = selectedRunId === r.id;
                  return (
                    <div
                      key={r.id}
                      onClick={() => setSelectedRunId(r.id)}
                      className={`p-4 border-2 cursor-pointer transition-all ${
                        isSelected
                          ? "bg-chaos-black text-white border-chaos-black shadow-tactile-orange translate-y-[-1px]"
                          : "bg-chaos-paper text-chaos-black border-chaos-black hover:bg-white shadow-tactile-sm"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-mono text-xs font-black">
                          {r.id.slice(0, 16)}...
                        </span>
                        <span
                          className={`font-mono text-[10px] font-bold px-1.5 py-0.5 border ${
                            r.kind === "retry"
                              ? "bg-chaos-orange text-chaos-black border-chaos-black"
                              : isSelected
                              ? "bg-white text-chaos-black border-white"
                              : "bg-chaos-canvas text-chaos-black border-chaos-black"
                          }`}
                        >
                          {r.kind === "retry" ? "RETRY" : "STANDARD"}
                        </span>
                      </div>

                      <div className="mt-3 flex justify-between items-baseline">
                        <span
                          className={`font-display font-black text-2xl ${
                            isSelected ? "text-chaos-orange" : "text-chaos-black"
                          }`}
                        >
                          {formatRupees(r.totalAmountPaise)}
                        </span>
                        <span
                          className={`font-mono text-xs ${
                            isSelected ? "text-stone-300" : "text-chaos-muted"
                          }`}
                        >
                          {r.totalFarmers} FARMERS
                        </span>
                      </div>

                      <div
                        className={`font-mono text-[10px] mt-1 uppercase ${
                          isSelected ? "text-stone-400" : "text-chaos-muted"
                        }`}
                      >
                        {new Date(r.createdAt).toLocaleString("en-IN")}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Selected Run Detail */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {loadingDetail ? (
              <div className="p-12 text-center font-mono text-xs uppercase tracking-wider text-chaos-muted bg-chaos-paper border-2 border-dashed border-chaos-black/40">
                [ ⏳ रन तपशील लोड होत आहे... ]
              </div>
            ) : !runDetail ? (
              <div className="p-12 text-center font-mono text-xs uppercase tracking-wider text-chaos-muted bg-chaos-paper border-2 border-dashed border-chaos-black/40">
                [ तपशील पाहण्यासाठी डावीकडील पेमेंट रन निवडा ]
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Run Metadata Header */}
                <div className="bg-chaos-paper border-2 border-chaos-black p-5 shadow-tactile flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-mono font-black text-sm text-chaos-black">
                          {runDetail.run.id}
                        </h3>
                        {runDetail.run.parentRunId && (
                          <span className="font-mono text-[10px] bg-amber-100 text-amber-950 border border-chaos-orange px-2 py-0.5">
                            PARENT: {runDetail.run.parentRunId.slice(0, 10)}...
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-xs text-chaos-muted uppercase block mt-0.5">
                        CREATED: {new Date(runDetail.run.createdAt).toLocaleString("en-IN")} • {runDetail.run.createdByName}
                      </span>
                    </div>

                    <div className="text-left sm:text-right">
                      <span className="font-mono text-[11px] font-bold text-chaos-muted uppercase block">
                        एकूण रक्कम (TOTAL RUN):
                      </span>
                      <span className="font-display font-black text-3xl text-chaos-black">
                        {formatRupees(runDetail.run.totalAmountPaise)}
                      </span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-3 border-t-2 border-chaos-black flex flex-wrap items-center justify-between gap-2.5">
                    <a
                      href={`/api/payment-runs/${runDetail.run.id}/file`}
                      download
                      className="bg-chaos-black text-white hover:bg-stone-800 font-mono text-xs font-bold uppercase tracking-wider px-4 py-2.5 border-2 border-chaos-black shadow-tactile-sm flex items-center gap-1.5 transition-all active:translate-y-0.5"
                    >
                      <span>📥 बँक CSV फाईल डाउनलोड // EXPORT CSV</span>
                    </a>

                    {/* Simulation Controls for Demo (§17 step 7) */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSimulateStatus("all_success")}
                        className="bg-chaos-canvas hover:bg-white text-chaos-black border-2 border-chaos-black font-mono text-xs font-bold uppercase px-3 py-1.5 shadow-tactile-sm active:translate-y-0.5"
                      >
                        ✓ SIMULATE ALL SUCCESS
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSimulateStatus("one_failed")}
                        className="bg-red-50 hover:bg-red-100 text-red-900 border-2 border-red-600 font-mono text-xs font-bold uppercase px-3 py-1.5 shadow-tactile-sm active:translate-y-0.5"
                      >
                        ⚠️ 1 FAILED
                      </button>
                    </div>
                  </div>

                  {/* Retry Failed button if failures exist (§12) */}
                  {runDetail.items.some((i) => i.status === "failed") && (
                    <div className="bg-red-50 border-2 border-red-600 p-3.5 flex justify-between items-center shadow-tactile-sm">
                      <div className="font-mono text-xs text-red-950 font-bold uppercase">
                        <span>[!] काही देयके अयशस्वी झाली आहेत // FAILURES DETECTED</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleRetryFailed}
                        className="bg-red-700 hover:bg-red-800 text-white font-mono text-xs font-bold uppercase tracking-wider px-3.5 py-2 border-2 border-chaos-black shadow-tactile-sm active:translate-y-0.5"
                      >
                        🔄 रीट्राय रन तयार करा // RETRY FAILED
                      </button>
                    </div>
                  )}
                </div>

                {/* Items Table */}
                <div className="bg-chaos-paper border-2 border-chaos-black shadow-tactile overflow-hidden">
                  <div className="p-3 bg-chaos-canvas border-b-2 border-chaos-black font-mono text-xs font-bold text-chaos-black uppercase tracking-wider flex justify-between">
                    <span>शेतकरी व बँक खाते (SNAPSHOT LEDGER)</span>
                    <span>स्थिती व रक्कम</span>
                  </div>

                  <div className="divide-y border-chaos-black/20">
                    {runDetail.items.map((item, idx) => (
                      <div key={item.id} className="p-3.5 flex justify-between items-center text-xs hover:bg-white transition-colors">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-chaos-muted">{idx + 1}.</span>
                            <span className="font-sans font-black text-chaos-black text-sm">
                              {item.farmerName}
                            </span>
                            <span className="font-mono text-chaos-black bg-chaos-canvas border border-chaos-black/30 px-1.5 py-0.2 text-[11px]">
                              {item.accountMasked}
                            </span>
                            <span className="text-chaos-muted font-mono text-[11px]">
                              {item.ifsc}
                            </span>
                          </div>
                          <span className="font-mono text-[11px] text-chaos-muted uppercase block mt-0.5">
                            पावत्या: {item.slipNumbers.join(", ")}
                          </span>
                          {item.failureReason && (
                            <span className="font-mono text-[11px] text-red-600 font-bold uppercase block mt-0.5">
                              कारण: {item.failureReason}
                            </span>
                          )}
                          {item.retriedByItemId && (
                            <span className="font-mono text-[11px] text-chaos-orange font-bold uppercase block mt-0.5">
                              रीट्राय आयटम: {item.retriedByItemId.slice(0, 10)}...
                            </span>
                          )}
                        </div>

                        <div className="text-right">
                          <span className="font-display font-black text-chaos-black text-lg block">
                            {formatRupees(item.amountPaise)}
                          </span>
                          <span
                            className={`inline-block mt-0.5 font-mono text-[10px] font-bold uppercase px-2 py-0.5 border ${
                              item.status === "success"
                                ? "bg-emerald-100 text-emerald-950 border-emerald-600"
                                : item.status === "failed"
                                ? "bg-red-100 text-red-950 border-red-600"
                                : item.status === "sent"
                                ? "bg-blue-100 text-blue-950 border-blue-600"
                                : "bg-chaos-canvas text-chaos-black border-chaos-black"
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
