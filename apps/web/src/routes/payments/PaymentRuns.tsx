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
      // Select all by default
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
      // Switch to history tab and select the created run
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

  // Selection toggle
  const toggleSelect = (id: string) => {
    setSelectedPurchaseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Computations for eligible tab
  const selectedEligible = eligible.filter((p) => selectedPurchaseIds.has(p.id));
  const selectedTotalPaise = selectedEligible.reduce((acc, p) => acc + p.amountPaise, 0);
  const selectedUniqueFarmers = new Set(selectedEligible.map((p) => p.memberId)).size;

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner */}
      <div className="bg-white p-4 rounded-xl border border-stone-300 flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-lg font-black text-stone-900">
            💳 शेतकरी बँक देयक व पेमेंट फाईल (Payment Runs & Bank Files)
          </h2>
          <p className="text-xs text-stone-600 font-semibold mt-0.5">
            मंजूर खरेदीच्या स्नॅपशॉटवरून एका क्लिकवर बँकेची CSV फाईल तयार करा (§12).
          </p>
        </div>

        {/* Sub-tabs */}
        <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-300 gap-1 text-xs font-bold">
          <button
            onClick={() => setActiveSubTab("eligible")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeSubTab === "eligible"
                ? "bg-emerald-700 text-white shadow-sm"
                : "text-stone-700 hover:text-stone-950"
            }`}
          >
            पात्र खरेदी (Eligible Purchases)
          </button>
          <button
            onClick={() => setActiveSubTab("runs")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeSubTab === "runs"
                ? "bg-emerald-700 text-white shadow-sm"
                : "text-stone-700 hover:text-stone-950"
            }`}
          >
            पेमेंट रन्स इतिहास (History)
          </button>
        </div>
      </div>

      {notice && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold p-3 rounded-xl flex justify-between items-center">
          <span>✓ {notice}</span>
          <button
            onClick={() => setNotice(null)}
            className="text-stone-500 hover:text-stone-900 font-black text-sm ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-900 text-xs font-bold p-3 rounded-xl">
          ⚠️ {error}
        </div>
      )}

      {/* SUB-TAB 1: ELIGIBLE PURCHASES */}
      {activeSubTab === "eligible" && (
        <div className="flex flex-col gap-4">
          {/* Summary Box & Create Button */}
          <div className="bg-emerald-950 text-white p-4 rounded-xl flex flex-wrap justify-between items-center gap-3">
            <div>
              <span className="text-xs font-bold text-emerald-300 uppercase block">
                निवडलेल्या खरेदीचा सारांश (Selection Summary)
              </span>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-2xl font-black text-white">
                  {formatRupees(selectedTotalPaise)}
                </span>
                <span className="text-xs text-emerald-200 font-semibold">
                  ({selectedUniqueFarmers} शेतकरी • {selectedEligible.length} पावत्या)
                </span>
              </div>
            </div>

            <Button
              variant="primary"
              disabled={creatingRun || selectedEligible.length === 0}
              onClick={handleCreateRun}
              className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-sm py-2.5 px-5"
            >
              {creatingRun ? "फाईल तयार होत आहे..." : "📄 पेमेंट रन तयार करा (Generate Run)"}
            </Button>
          </div>

          {loadingEligible ? (
            <div className="p-8 text-center text-stone-500 font-bold text-sm bg-white rounded-xl border border-stone-200">
              ⏳ देयकासाठी पात्र नोंदी शोधत आहे...
            </div>
          ) : eligible.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-stone-200 flex flex-col items-center gap-2">
              <span className="text-3xl">🌾</span>
              <span className="font-bold text-stone-800 text-sm">
                देयकासाठी सध्या कोणतीही नवीन मंजूर खरेदी उपलब्ध नाही.
              </span>
              <span className="text-xs text-stone-500">
                नवीन खरेदी सिंक झाल्यावर किंवा पडताळणी रांगेतून मंजूर झाल्यावर येथे दिसेल.
              </span>
            </div>
          ) : (
            <div className="bg-white border border-stone-300 rounded-xl overflow-hidden shadow-sm">
              <div className="p-3 bg-stone-50 border-b border-stone-200 flex justify-between items-center text-xs font-bold text-stone-700">
                <label className="flex items-center gap-2 cursor-pointer">
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
                    className="w-4 h-4 rounded text-emerald-600"
                  />
                  <span>सर्व निवडा ({eligible.length})</span>
                </label>
                <span>पावती व शेतकरी तपशील</span>
                <span>रक्कम</span>
              </div>

              <div className="divide-y divide-stone-200">
                {eligible.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => toggleSelect(p.id)}
                    className="p-3 flex items-center justify-between gap-3 hover:bg-stone-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedPurchaseIds.has(p.id)}
                        onChange={() => {}} // Handled by div onClick
                        className="w-4 h-4 rounded text-emerald-600 pointer-events-none"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-stone-900 text-sm">{p.farmerName}</span>
                          <span className="text-[11px] font-mono bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded font-bold">
                            {p.farmerCode}
                          </span>
                        </div>
                        <span className="text-xs text-stone-500 font-medium">
                          पावती: <b>{p.slipNo}</b> • {p.crop} ({(p.netKg).toFixed(1)} किग्रॅ)
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-black text-emerald-800">
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Left: Runs List */}
          <div className="md:col-span-1 flex flex-col gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-stone-600 px-1">
              पेमेंट रन्स यादी ({runs.length})
            </span>

            {loadingRuns ? (
              <div className="p-4 text-center text-xs text-stone-500 font-bold bg-white rounded-xl border border-stone-200">
                ⏳ रन्स लोड होत आहेत...
              </div>
            ) : runs.length === 0 ? (
              <div className="p-6 text-center text-xs text-stone-500 font-bold bg-white rounded-xl border border-stone-200">
                अद्याप कोणताही पेमेंट रन तयार केलेला नाही.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {runs.map((r) => {
                  const isSelected = selectedRunId === r.id;
                  return (
                    <div
                      key={r.id}
                      onClick={() => setSelectedRunId(r.id)}
                      className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        isSelected
                          ? "bg-stone-900 text-white border-stone-900 shadow-md"
                          : "bg-white text-stone-900 border-stone-200 hover:border-stone-400"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-mono text-xs font-black">
                          {r.id.slice(0, 14)}...
                        </span>
                        <span
                          className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                            r.kind === "retry"
                              ? "bg-amber-400 text-stone-950"
                              : isSelected
                              ? "bg-emerald-500 text-stone-950"
                              : "bg-emerald-100 text-emerald-900"
                          }`}
                        >
                          {r.kind === "retry" ? "रीट्राय (Retry)" : "प्रमाणित (Standard)"}
                        </span>
                      </div>

                      <div className="mt-2 flex justify-between items-baseline">
                        <span
                          className={`text-sm font-black ${
                            isSelected ? "text-emerald-300" : "text-emerald-800"
                          }`}
                        >
                          {formatRupees(r.totalAmountPaise)}
                        </span>
                        <span
                          className={`text-xs font-semibold ${
                            isSelected ? "text-stone-300" : "text-stone-500"
                          }`}
                        >
                          {r.totalFarmers} शेतकरी
                        </span>
                      </div>

                      <div
                        className={`text-[11px] mt-1 ${
                          isSelected ? "text-stone-400" : "text-stone-500"
                        }`}
                      >
                        {new Date(r.createdAt).toLocaleString("mr-IN")}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Selected Run Detail */}
          <div className="md:col-span-2 flex flex-col gap-3">
            {loadingDetail ? (
              <div className="p-12 text-center text-sm font-bold text-stone-500 bg-white rounded-xl border border-stone-200">
                ⏳ रन तपशील लोड होत आहे...
              </div>
            ) : !runDetail ? (
              <div className="p-12 text-center text-sm font-bold text-stone-500 bg-white rounded-xl border border-stone-200">
                तपशील पाहण्यासाठी डावीकडील पेमेंट रन निवडा.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Run Metadata Header */}
                <div className="bg-white p-4 rounded-xl border border-stone-300 shadow-sm flex flex-col gap-3">
                  <div className="flex flex-wrap justify-between items-start gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-mono font-black text-sm text-stone-900">
                          {runDetail.run.id}
                        </h3>
                        {runDetail.run.parentRunId && (
                          <span className="text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded">
                            मूळ रन: {runDetail.run.parentRunId.slice(0, 10)}...
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-stone-500 font-medium">
                        तयार केले: {new Date(runDetail.run.createdAt).toLocaleString("mr-IN")} • {runDetail.run.createdByName}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold text-stone-500 block">एकूण रक्कम:</span>
                      <span className="text-xl font-black text-emerald-800">
                        {formatRupees(runDetail.run.totalAmountPaise)}
                      </span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-2 border-t border-stone-200 flex flex-wrap items-center justify-between gap-2">
                    <a
                      href={`/api/payment-runs/${runDetail.run.id}/file`}
                      download
                      className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-sm"
                    >
                      <span>📥 बँक CSV फाईल डाउनलोड करा</span>
                    </a>

                    {/* Simulation Controls for Demo (§17 step 7) */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSimulateStatus("all_success")}
                        className="bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 text-xs font-bold px-2.5 py-1.5 rounded-lg"
                      >
                        ✓ बँक यश नोंदवा
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSimulateStatus("one_failed")}
                        className="bg-red-50 hover:bg-red-100 text-red-800 border border-red-200 text-xs font-bold px-2.5 py-1.5 rounded-lg"
                      >
                        ⚠️ १ अयशस्वी सिम्युलेट करा
                      </button>
                    </div>
                  </div>

                  {/* Retry Failed button if failures exist (§12) */}
                  {runDetail.items.some((i) => i.status === "failed") && (
                    <div className="bg-red-50 border border-red-300 p-3 rounded-xl flex justify-between items-center">
                      <div className="text-xs text-red-900 font-bold">
                        <span>काही देयके अयशस्वी झाली आहेत. रीट्राय मॉडेलनुसार नवीन रन तयार करा.</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleRetryFailed}
                        className="bg-red-700 hover:bg-red-800 text-white text-xs font-black px-4 py-2 rounded-lg shadow-sm"
                      >
                        🔄 पुन्हा प्रयत्न करा (Retry Failed)
                      </button>
                    </div>
                  )}
                </div>

                {/* Items Table */}
                <div className="bg-white border border-stone-300 rounded-xl overflow-hidden shadow-sm">
                  <div className="p-3 bg-stone-50 border-b border-stone-200 text-xs font-bold text-stone-700 flex justify-between">
                    <span>शेतकरी व बँक खाते (स्नॅपशॉटवरून)</span>
                    <span>स्थिती व रक्कम</span>
                  </div>

                  <div className="divide-y divide-stone-200">
                    {runDetail.items.map((item, idx) => (
                      <div key={item.id} className="p-3 flex justify-between items-center text-xs">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-stone-500">{idx + 1}.</span>
                            <span className="font-black text-stone-900 text-sm">
                              {item.farmerName}
                            </span>
                            <span className="font-mono text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded text-[11px]">
                              {item.accountMasked}
                            </span>
                            <span className="text-stone-500 font-mono text-[11px]">
                              {item.ifsc}
                            </span>
                          </div>
                          <span className="text-[11px] text-stone-500 font-medium block mt-0.5">
                            पावत्या: {item.slipNumbers.join(", ")}
                          </span>
                          {item.failureReason && (
                            <span className="text-[11px] text-red-700 font-bold block mt-0.5">
                              कारण: {item.failureReason}
                            </span>
                          )}
                          {item.retriedByItemId && (
                            <span className="text-[11px] text-amber-800 font-bold block mt-0.5">
                              रीट्राय आयटम आयडी: {item.retriedByItemId.slice(0, 8)}...
                            </span>
                          )}
                        </div>

                        <div className="text-right">
                          <span className="font-black text-stone-900 text-sm block">
                            {formatRupees(item.amountPaise)}
                          </span>
                          <span
                            className={`inline-block mt-0.5 text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                              item.status === "success"
                                ? "bg-emerald-100 text-emerald-900"
                                : item.status === "failed"
                                ? "bg-red-100 text-red-900"
                                : item.status === "sent"
                                ? "bg-blue-100 text-blue-900"
                                : "bg-stone-100 text-stone-800"
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

