import React, { useState, useEffect } from "react";
import { Button } from "../../ui/Button.js";
import { Field } from "../../ui/Field.js";
import { db, CachedPrice } from "../../offline/db.js";
import { syncMembersAndPrices } from "../../offline/syncMembersAndPrices.js";

interface PriceHistoryItem {
  id: string;
  crop: string;
  grade: string;
  rateRupees: number;
  rateFormatted: string;
  version: number;
  effectiveFrom: string;
  setBy: string;
  createdAt: string;
}

export const PriceBoard: React.FC = () => {
  const [currentPrices, setCurrentPrices] = useState<CachedPrice[]>([]);
  const [history, setHistory] = useState<PriceHistoryItem[]>([]);
  const [crop, setCrop] = useState("Soybean");
  const [grade, setGrade] = useState("FAQ");
  const [rateRupees, setRateRupees] = useState("4850");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const loadPrices = async () => {
    try {
      const cached = await db.prices.toArray();
      setCurrentPrices(cached);

      // Fetch history from API
      const res = await fetch("/api/prices/history");
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch (err) {
      console.warn("Could not load price history:", err);
    }
  };

  useEffect(() => {
    (async () => {
      await syncMembersAndPrices();
      await loadPrices();
    })();
  }, []);

  const handlePublishPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    const rateNum = parseFloat(rateRupees);
    if (!rateNum || rateNum <= 0) {
      alert("कृपया वैध दर टाका");
      return;
    }

    setLoading(true);
    setStatusMsg("");

    try {
      const ratePaise = Math.round(rateNum * 100);
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crop,
          grade,
          ratePaisePerQuintal: ratePaise,
        }),
      });

      if (!res.ok) {
        alert("दर प्रकाशित करता आला नाही.");
        return;
      }

      setStatusMsg(`✓ ${crop} चा नवीन दर ₹${rateNum}/क्विंटल यशस्वीरीत्या जाहीर झाला.`);
      await syncMembersAndPrices();
      await loadPrices();
      setTimeout(() => setStatusMsg(""), 4000);
    } catch {
      alert("सर्व्हरशी संपर्क होऊ शकला नाही.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 max-w-2xl mx-auto p-2">
      {/* Active Price Cards Hero */}
      <div className="bg-white p-5 rounded-2xl border-2 border-stone-800 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-black text-text-main">
              आजचा अधिकृत दर फलक (Active Price Board)
            </h2>
            <p className="text-xs font-bold text-text-muted">
              सर्व २२ खरेदी केंद्रांसाठी एकच केंद्रीय दर
            </p>
          </div>
          <span className="text-xs bg-emerald-100 text-brand border border-brand/40 px-3 py-1 rounded-full font-black">
            थेट लागू (Active)
          </span>
        </div>

        {statusMsg && (
          <div className="bg-emerald-50 border-2 border-brand text-brand font-bold text-sm p-3 rounded-xl mb-4">
            {statusMsg}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {currentPrices.map((p) => (
            <div
              key={p.id}
              className="bg-emerald-50/50 border-2 border-brand p-4 rounded-xl flex flex-col justify-between"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-black text-stone-900">
                    {p.crop === "Soybean" ? "सोयाबीन (Soybean)" : "तूर (Tur)"}
                  </h3>
                  <span className="text-xs font-bold text-text-muted">
                    प्रतवारी (Grade): {p.grade}
                  </span>
                </div>
                <span className="text-xs font-extrabold bg-stone-900 text-amber-300 px-2 py-0.5 rounded">
                  v{p.version}
                </span>
              </div>
              <div className="mt-4 pt-2 border-t border-emerald-200 flex items-baseline justify-between">
                <span className="text-xs font-bold text-text-muted">प्रति क्विंटल दर:</span>
                <span className="text-3xl font-black text-stone-950">
                  {p.rateFormatted}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Publish New Price Form (Office Manager Only) */}
      <div className="bg-white p-5 rounded-2xl border-2 border-stone-800 shadow-sm">
        <h3 className="text-lg font-black text-text-main mb-3">
          नवीन दर जाहीर करा (Publish Daily Rate)
        </h3>
        <form onSubmit={handlePublishPrice} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="crop-select" className="text-xs font-bold text-text-main">
              पीक निवडा:
            </label>
            <select
              id="crop-select"
              value={crop}
              onChange={(e) => setCrop(e.target.value)}
              className="min-h-touch px-3 py-2 rounded-lg border-2 border-stone-700 font-bold text-base bg-white"
            >
              <option value="Soybean">सोयाबीन (Soybean)</option>
              <option value="Tur">तूर (Tur)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="grade-select" className="text-xs font-bold text-text-main">
              प्रतवारी (Grade):
            </label>
            <select
              id="grade-select"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="min-h-touch px-3 py-2 rounded-lg border-2 border-stone-700 font-bold text-base bg-white"
            >
              <option value="FAQ">FAQ (मानक प्रत)</option>
            </select>
          </div>

          <Field
            label="नवीन दर (₹ प्रति क्विंटल)"
            type="number"
            value={rateRupees}
            onChange={(e) => setRateRupees(e.target.value)}
            required
          />

          <div className="sm:col-span-3 flex justify-end mt-2">
            <Button type="submit" disabled={loading} size="default">
              {loading ? "प्रकाशित होत आहे..." : "दर जाहीर करा (Publish)"}
            </Button>
          </div>
        </form>
      </div>

      {/* Price Change Audit History */}
      <div className="bg-white p-5 rounded-2xl border-2 border-stone-800 shadow-sm">
        <h3 className="text-base font-black text-text-main mb-3">
          दर बदल इतिहास (Price Audit History)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b-2 border-stone-800 text-text-muted">
                <th className="py-2 px-2">तारीख व वेळ</th>
                <th className="py-2 px-2">पीक</th>
                <th className="py-2 px-2">प्रत</th>
                <th className="py-2 px-2">आवृत्ती (v)</th>
                <th className="py-2 px-2 text-right">जाहीर दर</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-stone-200">
                  <td className="py-2.5 px-2 font-medium text-stone-700">
                    {new Date(h.effectiveFrom).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-2.5 px-2 font-bold text-stone-900">{h.crop}</td>
                  <td className="py-2.5 px-2 font-medium">{h.grade}</td>
                  <td className="py-2.5 px-2">
                    <span className="bg-stone-100 font-bold px-1.5 py-0.5 rounded border border-stone-300">
                      v{h.version}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-right font-black text-brand text-sm">
                    {h.rateFormatted}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

