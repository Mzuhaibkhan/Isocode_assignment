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
    <div className="flex flex-col gap-6 max-w-5xl mx-auto p-1 font-sans">
      {/* Masthead */}
      <div className="bg-chaos-paper border-2 border-chaos-black p-6 shadow-tactile flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs uppercase font-bold text-chaos-orange tracking-widest">
              DISPATCH AUDIT // SMS नोंदी
            </span>
            <span className="font-mono text-[10px] bg-chaos-black text-white px-2 py-0.5 uppercase tracking-wider">
              TELECOM GATEWAY
            </span>
          </div>
          <h2 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight text-chaos-black">
            SMS नोंदी (SMS AUDIT LOG)
          </h2>
          <p className="font-mono text-xs uppercase tracking-wider text-chaos-muted mt-1">
            TRANSPARENT SMS RECEIPT ARCHIVE DISPATCHED TO FARMERS (§11)
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <input
            type="text"
            placeholder="पावती किंवा मोबाईलने शोधा... (FILTER)"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3.5 py-2 font-mono text-xs border-2 border-chaos-black bg-white focus:outline-none focus:shadow-tactile-orange flex-1 md:w-56"
          />
          <Button variant="orange" onClick={fetchLogs} className="text-xs py-2 px-3.5 shadow-tactile-sm">
            REFRESH
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-red-50 border-2 border-red-600 text-red-900 font-mono text-xs font-bold uppercase tracking-wide shadow-tactile-sm">
          [!] {error}
        </div>
      )}

      {/* Messages List */}
      {loading ? (
        <div className="p-12 text-center text-chaos-muted font-mono text-xs uppercase tracking-wider bg-chaos-paper border-2 border-dashed border-chaos-black/40">
          [ ⏳ SMS नोंदी लोड होत आहेत // QUERYING SMS GATEWAY AUDIT... ]
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center bg-chaos-paper border-2 border-dashed border-chaos-black/40 font-mono text-xs uppercase tracking-wider text-chaos-muted shadow-tactile">
          [ कोणतीही SMS नोंद सापडली नाही // NO SMS LOGS FOUND ]
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((msg) => (
            <div
              key={msg.id}
              className="bg-chaos-paper border-2 border-chaos-black p-5 shadow-tactile flex flex-col justify-between gap-3.5"
            >
              <div className="flex justify-between items-start border-b-2 border-chaos-black pb-2.5">
                <div>
                  <span className="font-mono text-xs font-black bg-chaos-black text-chaos-orange px-2 py-0.5">
                    {msg.slipNo || "पावती"}
                  </span>
                  <span className="font-mono text-xs text-chaos-muted ml-2 font-bold">
                    📱 {msg.toMobileMasked}
                  </span>
                </div>
                <span className="font-mono text-[10px] font-bold uppercase bg-emerald-100 text-emerald-950 border border-emerald-600 px-2 py-0.5">
                  {msg.status === "sent" ? "SENT ✓" : msg.status}
                </span>
              </div>

              {/* Marathi SMS Body (§11) */}
              <div className="bg-white p-3.5 border-2 border-chaos-black font-mono text-xs whitespace-pre-line text-chaos-black leading-relaxed shadow-tactile-sm">
                {msg.body}
              </div>

              <div className="flex justify-between items-center font-mono text-[10px] text-chaos-muted uppercase">
                <span>वेळ: {new Date(msg.sentAt).toLocaleString("en-IN")}</span>
                <span>ID: {msg.id.slice(0, 16)}...</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
