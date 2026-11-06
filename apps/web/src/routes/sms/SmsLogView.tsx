import { useState, useEffect } from "react";
import { Button } from "../../ui/Button.js";

interface SmsRecord {
  id: string;
  purchaseId: string;
  toMobileMasked: string;
  body: string;
  status: string;
  sentAt: string;
  slipNo?: string;
  crop?: string;
}

export function SmsLogView() {
  const [messages, setMessages] = useState<SmsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/sms-log");
      if (!res.ok) {
        throw new Error("SMS नोंदी लोड करता आल्या नाहीत");
      }
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filtered = messages.filter((m) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      (m.slipNo && m.slipNo.toLowerCase().includes(q)) ||
      m.toMobileMasked.toLowerCase().includes(q) ||
      m.body.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-4 rounded-xl border border-stone-300 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-stone-900">💬 SMS नोंदी (SMS Audit Log)</h2>
          <p className="text-xs text-stone-600 font-semibold">
            शेतकऱ्यांना पाठवलेल्या सर्व डिजिटल पावत्यांची पारदर्शक नोंद (§11)
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="text"
            placeholder="पावती किंवा मोबाइलने शोधा..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-stone-400 rounded-lg flex-1 sm:w-48"
          />
          <Button variant="secondary" onClick={fetchLogs} className="text-xs py-2 px-3">
            ताजे करा (Refresh)
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-300 text-red-800 text-xs font-bold rounded-xl">
          ⚠️ {error}
        </div>
      )}

      {/* Messages List */}
      {loading ? (
        <div className="text-center py-12 text-stone-500 font-bold">लोड होत आहे...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-stone-500 bg-white rounded-xl border border-dashed border-stone-300 font-bold">
          कोणतीही SMS नोंद सापडली नाही
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((msg) => (
            <div
              key={msg.id}
              className="bg-white border-2 border-stone-300 rounded-xl p-4 shadow-sm flex flex-col justify-between gap-3"
            >
              <div className="flex justify-between items-start border-b border-stone-200 pb-2">
                <div>
                  <span className="text-xs font-black text-brand bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {msg.slipNo || "पावती"}
                  </span>
                  <span className="text-xs text-stone-500 ml-2 font-mono">
                    📱 {msg.toMobileMasked}
                  </span>
                </div>
                <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                  {msg.status === "sent" ? "पाठवला ✓" : msg.status}
                </span>
              </div>

              {/* Marathi SMS Body (§11) */}
              <div className="bg-stone-50 p-3 rounded-lg border border-stone-200 text-xs font-mono whitespace-pre-line text-stone-900 leading-relaxed">
                {msg.body}
              </div>

              <div className="flex justify-between items-center text-[10px] text-stone-500">
                <span>वेळ: {new Date(msg.sentAt).toLocaleString("mr-IN")}</span>
                <span className="font-mono text-stone-400">ID: {msg.id.slice(0, 14)}...</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
