import { useState, type FC } from "react";
import { formatRupees, formatSlipText } from "@procurement/shared";

export interface SlipProps {
  slipNo: string;
  farmerName: string;
  crop: string;
  netKg: string;
  moisturePercent: string;
  ratePerQuintal: number;
  amountPaise: number;
  smsStatus?: "pending" | "sent" | "offline";
  onShare?: () => void;
  onPrint?: () => void;
  onNewPurchase?: () => void;
}

export const Slip: FC<SlipProps> = ({
  slipNo,
  farmerName,
  crop,
  netKg,
  moisturePercent,
  ratePerQuintal,
  amountPaise,
  smsStatus = "sent",
  onShare,
  onPrint,
  onNewPurchase,
}) => {
  const [copied, setCopied] = useState(false);
  const formattedAmount = formatRupees(amountPaise);
  const formattedRate = formatRupees(ratePerQuintal * 100);

  const canonicalSlipText = formatSlipText({
    slipNo,
    farmerName,
    crop,
    netKg,
    moisturePercent,
    ratePerQuintal,
    amountFormatted: formattedAmount,
  });

  const handleShareClick = async () => {
    if (onShare) {
      onShare();
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: `पावती ${slipNo}`,
          text: canonicalSlipText,
        });
        return;
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.warn("Share failed, falling back to copy", err);
        } else {
          return;
        }
      }
    }

    // Clipboard fallback
    try {
      await navigator.clipboard.writeText(canonicalSlipText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      alert(canonicalSlipText);
    }
  };

  const handlePrintClick = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  };

  return (
    <div className="bg-white border-2 border-stone-900 rounded-2xl p-5 sm:p-6 shadow-lg max-w-sm mx-auto text-text-main flex flex-col gap-4">
      {/* Header with Slip No and SMS badge (§11) */}
      <div className="border-b-2 border-stone-300 pb-3 flex justify-between items-start">
        <div>
          <span className="text-xs uppercase font-black tracking-wider text-text-muted">
            खरेदी पावती
          </span>
          <p className="text-2xl font-black text-stone-950 tracking-tight">{slipNo}</p>
        </div>
        <div className="text-right">
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-bold inline-block ${
              smsStatus === "sent"
                ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                : smsStatus === "offline"
                ? "bg-blue-100 text-blue-900 border border-blue-300"
                : "bg-amber-100 text-amber-900 border border-amber-300"
            }`}
          >
            {smsStatus === "sent"
              ? "SMS पाठवला ✓"
              : smsStatus === "offline"
              ? "नेटवर्क आल्यावर SMS जाईल"
              : "SMS प्रलंबित..."}
          </span>
        </div>
      </div>

      {/* Farmer & Crop Header */}
      <div>
        <p className="text-2xl font-black text-stone-950 leading-tight">{farmerName}</p>
        <p className="text-base font-extrabold text-brand mt-0.5">{crop}</p>
      </div>

      {/* 2. Middle Specs: Net weight, moisture, rate */}
      <div className="bg-stone-50 p-3.5 rounded-xl border border-stone-300 grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-text-muted text-xs font-bold block">निव्वळ वजन</span>
          <span className="text-xl font-black text-stone-900">{netKg} किग्रॅ</span>
        </div>
        <div>
          <span className="text-text-muted text-xs font-bold block">ओलावा</span>
          <span className="text-xl font-black text-stone-900">{moisturePercent}%</span>
        </div>
        <div className="col-span-2 border-t border-stone-200 pt-2 flex justify-between items-center">
          <span className="text-text-muted text-xs font-bold">दर प्रति क्विंटल</span>
          <span className="text-base font-black text-stone-800">
            {formattedRate} / क्विंटल
          </span>
        </div>
      </div>

      {/* 1. Amount Hero - Largest Visual Element (>= 40px font §11, §13.1) */}
      <div className="bg-emerald-50 border-2 border-emerald-600/40 p-4 rounded-xl text-center shadow-inner">
        <span className="text-xs font-black text-emerald-800 uppercase tracking-wider block">
          रक्कम (एकूण देय)
        </span>
        <span className="text-4xl sm:text-5xl font-black text-stone-950 tracking-tight block my-1">
          {formattedAmount}
        </span>
        <span className="text-xs font-extrabold text-emerald-900 block mt-1">
          ४८ तासांत पैसे जमा होतील
        </span>
      </div>

      {/* Action Buttons: Share & Print & New */}
      <div className="flex flex-col gap-2 pt-1">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleShareClick}
            className="min-h-touch bg-stone-950 text-white font-black rounded-xl active:bg-stone-800 hover:bg-stone-850 text-sm py-3 px-3 shadow transition-colors flex items-center justify-center gap-1.5"
          >
            <span>📱</span>
            <span>{copied ? "कॉपी झाली! ✓" : "शेअर करा (Share)"}</span>
          </button>

          <button
            type="button"
            onClick={handlePrintClick}
            className="min-h-touch border-2 border-stone-900 bg-white font-black rounded-xl active:bg-stone-100 text-stone-950 text-sm py-3 px-3 shadow-sm transition-colors flex items-center justify-center gap-1.5"
          >
            <span>🖨️</span>
            <span>प्रिंट (Print)</span>
          </button>
        </div>

        {onNewPurchase && (
          <button
            type="button"
            onClick={onNewPurchase}
            className="min-h-touch w-full bg-brand text-white font-black rounded-xl active:bg-emerald-800 text-sm py-3 px-4 shadow transition-colors"
          >
            🌾 नवीन खरेदी नोंदवा (Next Farmer)
          </button>
        )}
      </div>

      {copied && (
        <div className="text-center text-xs font-black text-emerald-700 bg-emerald-50 py-1 rounded">
          पावती क्लिपबोर्डवर कॉपी केली आहे! (Copied to clipboard)
        </div>
      )}
    </div>
  );
};
