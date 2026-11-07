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
    <div className="flex flex-col gap-6 max-w-4xl mx-auto p-1 font-sans">
      {/* Active Price Cards Hero */}
      <div className="bg-chaos-paper border-2 border-chaos-black p-6 shadow-tactile">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-6 border-b-2 border-chaos-black pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs uppercase font-bold text-chaos-orange tracking-widest">
                OFFICIAL COMMODITY BOARD // दर फलक
              </span>
              <span className="font-mono text-[10px] bg-chaos-black text-white px-2 py-0.5 uppercase tracking-wider">
                DISTRICT WIDE
              </span>
            </div>
            <h2 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight text-chaos-black">
              आजचा अधिकृत दर फलक (ACTIVE PRICE BOARD)
            </h2>
            <p className="font-mono text-xs uppercase tracking-wider text-chaos-muted mt-0.5">
              UNIFIED RATES ACROSS ALL 22 PROCUREMENT SHEDS • LATUR HQ
            </p>
          </div>
          <span className="font-mono text-xs bg-chaos-orange text-chaos-black border-2 border-chaos-black px-3 py-1 font-black uppercase tracking-wider shadow-tactile-sm">
            ACTIVE // थेट लागू
          </span>
        </div>

        {statusMsg && (
          <div className="bg-emerald-50 border-2 border-emerald-600 text-emerald-900 font-mono text-xs font-bold p-3 shadow-tactile-sm mb-4 uppercase tracking-wide">
            {statusMsg}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {currentPrices.map((p) => (
            <div
              key={p.id}
              className="bg-white border-2 border-chaos-black p-5 shadow-tactile-sm flex flex-col justify-between"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-display font-black text-3xl uppercase tracking-tight text-chaos-black">
                    {p.crop === "Soybean" ? "सोयाबीन (SOYBEAN)" : "तूर (TUR)"}
                  </h3>
                  <span className="font-mono text-xs text-chaos-muted uppercase tracking-wider block mt-0.5">
                    GRADE: {p.grade} (मानक प्रत)
                  </span>
                </div>
                <span className="font-mono text-xs font-black bg-chaos-black text-chaos-orange px-2 py-0.5">
                  v{p.version}
                </span>
              </div>

              <div className="mt-6 pt-4 border-t-2 border-chaos-black flex items-baseline justify-between">
                <span className="font-mono text-xs uppercase font-bold text-chaos-muted">
                  प्रति क्विंटल दर (PER QTL):
                </span>
                <span className="font-display font-black text-4xl sm:text-5xl text-chaos-black tracking-tight">
                  {p.rateFormatted}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Publish New Price Form (Office Manager Only) */}
      <div className="bg-chaos-paper border-2 border-chaos-black p-6 shadow-tactile">
        <div className="border-b-2 border-chaos-black pb-3 mb-4">
          <span className="font-mono text-xs uppercase font-bold text-chaos-orange tracking-widest block">
            ADMINISTRATIVE DISPATCH // नवीन दर
          </span>
          <h3 className="font-display font-black text-2xl uppercase tracking-tight text-chaos-black">
            नवीन दर जाहीर करा (PUBLISH DAILY RATE)
          </h3>
        </div>

        <form onSubmit={handlePublishPrice} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="crop-select" className="font-mono text-xs font-bold uppercase tracking-wider text-chaos-black">
              पीक निवडा (COMMODITY):
            </label>
            <select
              id="crop-select"
              value={crop}
              onChange={(e) => setCrop(e.target.value)}
              className="min-h-[48px] px-3.5 py-2.5 rounded-none border-2 border-chaos-black font-mono font-bold text-sm bg-chaos-canvas text-chaos-black focus:bg-white focus:outline-none focus:shadow-tactile-orange"
            >
              <option value="Soybean">सोयाबीन (SOYBEAN)</option>
              <option value="Tur">तूर (TUR)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="grade-select" className="font-mono text-xs font-bold uppercase tracking-wider text-chaos-black">
              प्रतवारी (GRADE):
            </label>
            <select
              id="grade-select"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="min-h-[48px] px-3.5 py-2.5 rounded-none border-2 border-chaos-black font-mono font-bold text-sm bg-chaos-canvas text-chaos-black focus:bg-white focus:outline-none focus:shadow-tactile-orange"
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
            <Button
              type="submit"
              variant="orange"
              disabled={loading}
              size="default"
              className="shadow-tactile-sm"
            >
              {loading ? "प्रकाशित होत आहे..." : "दर जाहीर करा // PUBLISH RATE"}
            </Button>
          </div>
        </form>
      </div>

      {/* Price Change Audit History */}
      <div className="bg-chaos-paper border-2 border-chaos-black p-6 shadow-tactile">
        <div className="border-b-2 border-chaos-black pb-3 mb-4 flex justify-between items-center">
          <h3 className="font-display font-black text-xl uppercase tracking-tight text-chaos-black">
            दर बदल इतिहास (PRICE AUDIT LOG)
          </h3>
          <span className="font-mono text-xs text-chaos-muted uppercase">
            IMMUTABLE LEDGER
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b-2 border-chaos-black text-chaos-muted uppercase">
                <th className="py-2.5 px-2">तारीख व वेळ (TIMESTAMP)</th>
                <th className="py-2.5 px-2">पीक (CROP)</th>
                <th className="py-2.5 px-2">प्रत (GRADE)</th>
                <th className="py-2.5 px-2">आवृत्ती (VER)</th>
                <th className="py-2.5 px-2 text-right">जाहीर दर (RATE)</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-stone-300 hover:bg-chaos-canvas transition-colors">
                  <td className="py-3 px-2 text-chaos-black font-medium">
                    {new Date(h.effectiveFrom).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-3 px-2 font-bold text-chaos-black uppercase">{h.crop}</td>
                  <td className="py-3 px-2 text-chaos-muted">{h.grade}</td>
                  <td className="py-3 px-2">
                    <span className="bg-chaos-canvas border border-chaos-black px-1.5 py-0.5 font-bold text-chaos-black">
                      v{h.version}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-right font-display font-black text-lg text-chaos-black">
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
