import { useState, useEffect } from "react";
import { formatRupees, SyncHoldReason } from "@procurement/shared";
import { Button } from "../../ui/Button.js";

interface HeldPurchase {
  id: string;
  slipNo: string;
  farmerName: string;
  farmerCode: string;
  crop: string;
  netKg: number;
  amountRupees: number;
  flagCodes: string[];
  clientTime: string;
  photoUrl?: string | null;
}

const FLAG_LABELS: Record<string, { label: string; desc: string }> = {
  [SyncHoldReason.DUPLICATE_FARMER]: {
    label: "दुबार शेतकरी",
    desc: "६० मिनिटांत दुसरी खरेदी नोंदवली गेली आहे (Duplicate Farmer)",
  },
  [SyncHoldReason.YIELD_HIGH]: {
    label: "जास्त उत्पादन",
    desc: "शेतजमिनीच्या मर्यादेपेक्षा जास्त वजन (Yield Quota Exceeded)",
  },
  [SyncHoldReason.UNIFORM_MOISTURE]: {
    label: "ओलावा विसंगती",
    desc: "सलग २० वाचनांमध्ये प्रमाण विचलन < ०.३ (Uniform Moisture)",
  },
  [SyncHoldReason.CLOCK_SKEW]: {
    label: "घड्याळ विसंगती",
    desc: "मोबाईलचे घड्याळ सर्व्हरपेक्षा ६ तासांहून अधिक विसंगत (Clock Skew)",
  },
  [SyncHoldReason.STALE_PRICE_VERSION]: {
    label: "जुनी दर आवृत्ती",
    desc: "ऑफलाइन काळात दर बदलला होता (Stale Price Version)",
  },
  [SyncHoldReason.CONSENT_WITHDRAWN]: {
    label: "संमती मागे",
    desc: "शेतकऱ्याने DPDP संमती मागे घेतलेली आहे (Consent Withdrawn)",
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
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl border border-stone-300 flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-lg font-black text-stone-900">
            📋 संशयित खरेदी पडताळणी रांग (Review Queue)
          </h2>
          <p className="text-xs text-stone-600 font-semibold mt-0.5">
            प्रणालीने फ्लॅग केलेल्या संशयास्पद नोंदी. मंजुरीशिवाय या नोंदींचे पेमेंट केले जात नाही.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-amber-100 text-amber-900 border border-amber-300 text-xs font-black px-3 py-1.5 rounded-lg">
            प्रलंबित: {heldPurchases.length}
          </span>
          <Button variant="secondary" onClick={fetchHeld} className="text-xs py-1.5">
            🔄 रिफ्रेश
          </Button>
        </div>
      </div>

      {actionNotice && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold p-3 rounded-xl flex justify-between items-center">
          <span>✓ {actionNotice}</span>
          <button
            onClick={() => setActionNotice(null)}
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

      {loading ? (
        <div className="p-8 text-center text-stone-500 font-bold text-sm bg-white rounded-xl border border-stone-200">
          ⏳ पडताळणी रांग लोड होत आहे...
        </div>
      ) : heldPurchases.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-stone-200 flex flex-col items-center gap-2">
          <span className="text-3xl">🎉</span>
          <span className="font-bold text-stone-800 text-sm">
            सध्या पुनरावलोकनासाठी कोणतीही खरेदी प्रलंबित नाही.
          </span>
          <span className="text-xs text-stone-500">
            सर्व खरेदी नियमांनुसार वैध ठरल्या आहेत.
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {heldPurchases.map((item) => (
            <div
              key={item.id}
              className="bg-white border-2 border-amber-400/80 rounded-xl p-4 shadow-sm flex flex-col gap-3"
            >
              <div className="flex flex-wrap justify-between items-start gap-2 border-b border-stone-200 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-stone-900 text-base">
                      {item.farmerName}
                    </span>
                    <span className="text-xs font-mono font-bold bg-stone-100 text-stone-700 px-2 py-0.5 rounded">
                      {item.farmerCode}
                    </span>
                  </div>
                  <span className="text-xs text-stone-500 font-medium">
                    पावती क्र: <b>{item.slipNo}</b> • {new Date(item.clientTime).toLocaleString("mr-IN")}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-xs font-bold text-stone-500 block">एकूण रक्कम:</span>
                  <span className="text-lg font-black text-emerald-800">
                    {formatRupees(item.amountRupees * 100)}
                  </span>
                  <span className="text-xs text-stone-600 block font-semibold">
                    वजन: <b>{item.netKg.toFixed(1)} किग्रॅ</b> • {item.crop}
                  </span>
                </div>
              </div>

              {/* Flags Triggered */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-900">
                  कारणे / फ्लॅग (Flag Reasons):
                </span>
                <div className="flex flex-wrap gap-2">
                  {item.flagCodes.map((code) => {
                    const info = FLAG_LABELS[code] || { label: code, desc: code };
                    return (
                      <div
                        key={code}
                        className="bg-amber-100/80 border border-amber-300 text-amber-950 px-2.5 py-1 rounded-lg text-xs"
                      >
                        <span className="font-black">{info.label}</span>
                        <span className="text-[11px] text-amber-800 block">{info.desc}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Note input & Actions */}
              <div className="mt-1 pt-3 border-t border-stone-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  placeholder="व्यवस्थापक शेरा / कारण टाका (Optional note)..."
                  value={reviewNote[item.id] || ""}
                  onChange={(e) =>
                    setReviewNote((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                  className="flex-1 text-xs p-2 border border-stone-300 rounded-lg focus:outline-none focus:border-stone-600"
                />

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={submittingId === item.id}
                    onClick={() => handleRelease(item.id)}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black px-4 py-2 rounded-lg transition-all active:scale-95 whitespace-nowrap"
                  >
                    ✓ मंजूर करा (Approve)
                  </button>
                  <button
                    type="button"
                    disabled={submittingId === item.id}
                    onClick={() => handleHold(item.id)}
                    className="bg-stone-700 hover:bg-stone-800 text-white text-xs font-black px-3 py-2 rounded-lg transition-all active:scale-95 whitespace-nowrap"
                  >
                    होल्ड ठेवा (Keep Held)
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

