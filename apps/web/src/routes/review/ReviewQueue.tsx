import { useState, useEffect } from "react";
import { SyncHoldReason } from "@procurement/shared";
import { Button } from "../../ui/Button.js";

interface HeldPhoto {
  id: string;
  kind: "scale" | "meter";
  imageData?: string | null;
  aiValueX10?: number | null;
  typedValueX10?: number | null;
  matched?: boolean | null;
}

interface HeldPurchase {
  id: string;
  slipNo: string;
  farmerName: string;
  farmerCode: string;
  crop: string;
  netKg: string;
  amountFormatted: string;
  flagCodes: string[];
  clientTime: string;
  photos?: HeldPhoto[];
}

const FLAG_LABELS: Record<string, { label: string; desc: string }> = {
  [SyncHoldReason.DUPLICATE_FARMER]: {
    label: "दुबार शेतकरी (DUPLICATE)",
    desc: "६० मिनिटांत दुसरी खरेदी नोंदवली गेली आहे (DUPLICATE IN 60 MIN)",
  },
  [SyncHoldReason.YIELD_HIGH]: {
    label: "जास्त उत्पादन (YIELD EXCEEDED)",
    desc: "शेतजमिनीच्या मर्यादेपेक्षा जास्त वजन (LAND QUOTA BREACH)",
  },
  [SyncHoldReason.UNIFORM_MOISTURE]: {
    label: "ओलावा विसंगती (UNIFORM MOISTURE)",
    desc: "सलग २० वाचनांमध्ये प्रमाण विचलन < ०.३ (STDEV < 0.3)",
  },
  [SyncHoldReason.CLOCK_SKEW]: {
    label: "घड्याळ विसंगती (CLOCK SKEW)",
    desc: "मोबाईलचे घड्याळ सर्व्हरपेक्षा ६ तासांहून अधिक विसंगत (SKEW > 6H)",
  },
  [SyncHoldReason.STALE_PRICE_VERSION]: {
    label: "जुनी दर आवृत्ती (STALE PRICE)",
    desc: "ऑफलाइन काळात दर बदलला होता (OUTDATED PRICE VERSION)",
  },
  [SyncHoldReason.CONSENT_WITHDRAWN]: {
    label: "संमती मागे (CONSENT WITHDRAWN)",
    desc: "शेतकऱ्याने DPDP संमती मागे घेतलेली आहे (DPDP WITHDRAWAL)",
  },
};

export function ReviewQueue() {
  const [heldPurchases, setHeldPurchases] = useState<HeldPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});

  const fetchHeld = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/review/flagged");
      if (!res.ok) {
        throw new Error(`सर्व्हर त्रुटी: ${res.status}`);
      }
      const data = await res.json();
      setHeldPurchases(data.heldPurchases || []);
    } catch (err: any) {
      setError(err.message || "पुनरावलोकन यादी लोड करता आली नाही");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHeld();
  }, []);

  const handleRelease = async (id: string) => {
    try {
      setSubmittingId(id);
      const note = reviewNote[id] || "कार्यालय व्यवस्थापकाद्वारे पडताळणी करून मंजूर (Verified and approved)";
      const res = await fetch(`/api/review/${id}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "मंजूर करता आले नाही");
      }

      setActionNotice(`खरेदी यशस्वीरित्या मंजूर केली गेली आणि पेमेंटसाठी पात्र ठरली.`);
      await fetchHeld();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmittingId(null);
    }
  };

  const handleHold = async (id: string) => {
    try {
      setSubmittingId(id);
      const note = reviewNote[id] || "अधिक तपासणीसाठी होल्ड कायम ठेवला (Hold maintained)";
      const res = await fetch(`/api/review/${id}/hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "होल्ड ठेवता आले नाही");
      }

      setActionNotice(`होल्ड कायम ठेवण्यात आला आणि ऑडिट लॉगमध्ये नोंद झाली.`);
      await fetchHeld();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto p-1 font-sans">
      {/* Masthead */}
      <div className="bg-chaos-paper border-2 border-chaos-black p-6 shadow-tactile flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs uppercase font-bold text-chaos-orange tracking-widest">
              EXCEPTION AUDIT // पडताळणी रांग
            </span>
            <span className="font-mono text-[10px] bg-chaos-black text-white px-2 py-0.5 uppercase tracking-wider">
              RISK ENGINE
            </span>
          </div>
          <h2 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight text-chaos-black">
            संशयित खरेदी पडताळणी (REVIEW QUEUE)
          </h2>
          <p className="font-mono text-xs uppercase tracking-wider text-chaos-muted mt-1">
            PAYMENT PREVENTED UNTIL EXPLICIT OFFICE AUTHORIZATION (§10)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-chaos-canvas text-chaos-black border-2 border-chaos-black font-mono text-xs font-black px-3 py-1.5 shadow-tactile-sm uppercase">
            HELD: {heldPurchases.length}
          </span>
          <Button variant="orange" onClick={fetchHeld} className="text-xs py-1.5 shadow-tactile-sm">
            🔄 REFRESH
          </Button>
        </div>
      </div>

      {actionNotice && (
        <div className="bg-emerald-50 border-2 border-emerald-600 text-emerald-950 font-mono text-xs font-bold p-3.5 shadow-tactile-sm flex justify-between items-center uppercase tracking-wide">
          <span>✓ {actionNotice}</span>
          <button
            onClick={() => setActionNotice(null)}
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

      {loading ? (
        <div className="p-12 text-center text-chaos-muted font-mono text-xs uppercase tracking-wider bg-chaos-paper border-2 border-dashed border-chaos-black/40">
          [ ⏳ पडताळणी रांग लोड होत आहे // QUERYING EXCEPTION STORE... ]
        </div>
      ) : heldPurchases.length === 0 ? (
        <div className="p-12 text-center bg-chaos-paper border-2 border-dashed border-chaos-black/40 flex flex-col items-center gap-2 shadow-tactile">
          <span className="font-display font-black text-3xl uppercase tracking-tight text-chaos-black">
            ALL EXCEPTION FLAGS RESOLVED
          </span>
          <p className="font-mono text-xs text-chaos-muted uppercase tracking-wider">
            सध्या पुनरावलोकनासाठी कोणतीही खरेदी प्रलंबित नाही • NO TRANSACTIONS BLOCKED
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {heldPurchases.map((item) => (
            <div
              key={item.id}
              className="bg-chaos-paper border-2 border-chaos-black p-5 shadow-tactile flex flex-col gap-3"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start gap-3 border-b-2 border-chaos-black pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-sans font-black text-chaos-black text-lg">
                      {item.farmerName}
                    </span>
                    <span className="font-mono text-xs font-bold bg-chaos-black text-chaos-orange px-2 py-0.5">
                      {item.farmerCode}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-chaos-muted uppercase block mt-0.5">
                    पावती क्र: <b>{item.slipNo}</b> • {new Date(item.clientTime).toLocaleString("en-IN")}
                  </span>
                </div>

                <div className="text-left sm:text-right">
                  <span className="font-mono text-[11px] font-bold text-chaos-muted uppercase block">
                    एकूण रक्कम (PAYABLE):
                  </span>
                  <span className="font-display font-black text-2xl text-chaos-black">
                    {item.amountFormatted}
                  </span>
                  <span className="font-mono text-xs text-chaos-muted block">
                    वजन: <b className="text-chaos-black">{item.netKg} KG</b> • {item.crop}
                  </span>
                </div>
              </div>

              {/* Flags Triggered */}
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-chaos-orange">
                  [ ⚠️ कारणीभूत फ्लॅग // RISK SIGNALS TRIGGERED ]:
                </span>
                <div className="flex flex-wrap gap-2">
                  {item.flagCodes.map((code) => {
                    const info = FLAG_LABELS[code] || { label: code, desc: code };
                    return (
                      <div
                        key={code}
                        className="bg-chaos-canvas border-2 border-chaos-black p-2 font-mono text-xs shadow-tactile-sm"
                      >
                        <span className="font-black text-chaos-black block">{info.label}</span>
                        <span className="text-[10px] text-chaos-muted uppercase block mt-0.5">{info.desc}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Attached scale/meter photo evidence (§10.2) */}
              {item.photos && item.photos.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-chaos-orange">
                    [ 📷 डिस्प्ले फोटो पुरावा // DISPLAY PHOTO EVIDENCE ]:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {item.photos.map((ph) => (
                      <div
                        key={ph.id}
                        className="bg-white border-2 border-chaos-black p-2 flex gap-3 items-center"
                      >
                        {ph.imageData ? (
                          <img
                            src={ph.imageData}
                            alt={`${ph.kind} display`}
                            className="w-24 h-18 object-cover border border-chaos-black"
                          />
                        ) : (
                          <div className="w-24 h-18 border border-dashed border-chaos-black/40 flex items-center justify-center font-mono text-[10px] text-chaos-muted">
                            NO IMAGE
                          </div>
                        )}
                        <div className="font-mono text-[11px] leading-tight">
                          <span className="font-black uppercase block">
                            {ph.kind === "scale" ? "काटा (SCALE)" : "मीटर (METER)"}
                          </span>
                          <span className="text-chaos-muted block mt-0.5">
                            AI:{" "}
                            {ph.aiValueX10 != null
                              ? `${(ph.aiValueX10 / 10).toFixed(1)}`
                              : "—"}
                            {" "}• TYPED:{" "}
                            {ph.typedValueX10 != null
                              ? `${(ph.typedValueX10 / 10).toFixed(1)}`
                              : "—"}
                          </span>
                          <span
                            className={`font-bold block ${
                              ph.matched ? "text-emerald-700" : "text-red-700"
                            }`}
                          >
                            {ph.matched ? "MATCH ✓" : "MISMATCH ⚠"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Note input & Actions */}
              <div className="mt-2 pt-3 border-t-2 border-chaos-black flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <input
                  type="text"
                  placeholder="व्यवस्थापक शेरा टाका // AUDIT RESOLUTION NOTE..."
                  value={reviewNote[item.id] || ""}
                  onChange={(e) =>
                    setReviewNote((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                  className="flex-1 font-mono text-xs p-2.5 border-2 border-chaos-black bg-white focus:outline-none focus:shadow-tactile-orange"
                />

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={submittingId === item.id}
                    onClick={() => handleRelease(item.id)}
                    className="font-mono text-xs font-bold uppercase tracking-wider bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2.5 border-2 border-chaos-black shadow-tactile-sm transition-all active:translate-y-0.5 whitespace-nowrap"
                  >
                    ✓ मंजूर करा // APPROVE
                  </button>
                  <button
                    type="button"
                    disabled={submittingId === item.id}
                    onClick={() => handleHold(item.id)}
                    className="font-mono text-xs font-bold uppercase tracking-wider bg-chaos-black hover:bg-stone-800 text-white px-3 py-2.5 border-2 border-chaos-black shadow-tactile-sm transition-all active:translate-y-0.5 whitespace-nowrap"
                  >
                    होल्ड ठेवा // KEEP HELD
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
