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
    <div className="bg-white border-2 border-chaos-400 rounded-2xl p-5 sm:p-6 shadow-tactile-lg max-w-sm mx-auto text-chaos-400 flex flex-col gap-4 animate-fade-in">
      {/* Header with Slip No and SMS badge (§11) */}
      <div className="border-b-2 border-chaos-200 pb-3 flex justify-between items-start">
        <div>
          <span className="text-[11px] font-mono uppercase font-black tracking-widest text-chaos-300 block">
            खरेदी पावती (RECEIPT)
          </span>
          <p className="font-mono text-2xl font-black text-chaos-400 tracking-tight">{slipNo}</p>
        </div>
        <div className="text-right">
          <span
            className={`font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-md font-black inline-block border ${
              smsStatus === "sent"
                ? "bg-emerald-100 text-emerald-950 border-emerald-400"
                : smsStatus === "offline"
                ? "bg-amber-100 text-amber-950 border-amber-400"
                : "bg-stone-100 text-stone-700 border-stone-300"
            }`}
          >
            {smsStatus === "sent"
              ? "SMS पाठवला ✓"
              : smsStatus === "offline"
              ? "SMS रांगेत ⏳"
              : "प्रलंबित"}
          </span>
        </div>
      </div>

      {/* Farmer and Crop info */}
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-bold text-chaos-300 uppercase tracking-wide">सभासद शेतकरी:</span>
        <h3 className="text-2xl font-black text-chaos-400 leading-tight">{farmerName}</h3>
        <p className="text-sm font-bold text-chaos-300 mt-0.5">{crop}</p>
      </div>

      {/* Center Amount Highlight - Monumental Display (§13.1) */}
      <div className="bg-chaos-100 p-4 rounded-xl border-2 border-chaos-400 text-center shadow-inner">
        <span className="text-[11px] font-mono font-black uppercase tracking-widest text-chaos-300 block mb-1">
          एकूण देय रक्कम (NET PAYABLE)
        </span>
        <span className="font-display text-4xl sm:text-5xl font-black text-chaos-400 block tracking-tight">
          {formattedAmount}
        </span>
      </div>

      {/* Grid Details */}
      <div className="grid grid-cols-2 gap-2 text-xs font-bold bg-stone-50 p-3 rounded-xl border border-chaos-200">
        <div>
          <span className="text-chaos-300 text-[10px] font-mono uppercase block">निव्वळ वजन:</span>
          <span className="font-mono text-base font-black text-chaos-400">{netKg} किग्रॅ</span>
        </div>
        <div>
          <span className="text-chaos-300 text-[10px] font-mono uppercase block">हमीभाव दर:</span>
          <span className="font-mono text-base font-black text-chaos-400">{formattedRate}/qtl</span>
        </div>
        <div className="mt-1">
          <span className="text-chaos-300 text-[10px] font-mono uppercase block">ओलावा प्रमाण:</span>
          <span className="font-mono text-base font-black text-chaos-400">{moisturePercent}%</span>
        </div>
        <div className="mt-1">
          <span className="text-chaos-300 text-[10px] font-mono uppercase block">कपात:</span>
          <span className="font-mono text-base font-black text-chaos-400">
            {parseFloat(moisturePercent) > 12.0
              ? `${((parseFloat(moisturePercent) - 12.0) * 1).toFixed(1)}%`
              : "0%"}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-2 border-t-2 border-chaos-200">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleShareClick}
            className="btn-tactile min-h-[46px] bg-white border-2 border-chaos-400 text-chaos-400 font-mono text-xs font-black uppercase tracking-wider rounded-lg hover:bg-chaos-100 flex items-center justify-center gap-1 shadow-tactile active:translate-y-[1px]"
          >
            {copied ? "कॉपी झाले ✓" : "शेअर / कॉपी"}
          </button>
          <button
            type="button"
            onClick={handlePrintClick}
            className="btn-tactile min-h-[46px] bg-white border-2 border-chaos-400 text-chaos-400 font-mono text-xs font-black uppercase tracking-wider rounded-lg hover:bg-chaos-100 flex items-center justify-center gap-1 shadow-tactile active:translate-y-[1px]"
          >
            प्रिंट करा 🖨️
          </button>
        </div>

        {onNewPurchase && (
          <button
            type="button"
            onClick={onNewPurchase}
            className="btn-tactile min-h-[48px] w-full bg-chaos-500 hover:bg-orange-600 text-chaos-400 border-2 border-chaos-400 font-display text-lg font-black uppercase tracking-wide rounded-lg flex items-center justify-center gap-1 shadow-tactile active:translate-y-[2px]"
          >
            + नवीन खरेदी नोंदवा (New Entry)
          </button>
        )}
      </div>
    </div>
  );
};
