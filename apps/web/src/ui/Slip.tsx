import React from "react";
import { formatRupees } from "@procurement/shared";

export interface SlipProps {
  slipNo: string;
  farmerName: string;
  crop: string;
  netKg: string;
  moisturePercent: string;
  ratePerQuintal: number;
  amountPaise: number;
  smsStatus?: "pending" | "sent";
  onShare?: () => void;
  onPrint?: () => void;
}

export const Slip: React.FC<SlipProps> = ({
  slipNo,
  farmerName,
  crop,
  netKg,
  moisturePercent,
  ratePerQuintal,
  amountPaise,
  smsStatus = "pending",
  onShare,
  onPrint,
}) => {
  const formattedAmount = formatRupees(amountPaise);
  const formattedRate = formatRupees(ratePerQuintal * 100);

  return (
    <div className="bg-white border-2 border-stone-800 rounded-2xl p-6 shadow-md max-w-sm mx-auto text-text-main flex flex-col gap-4">
      {/* Header */}
      <div className="border-b-2 border-stone-300 pb-3 flex justify-between items-start">
        <div>
          <span className="text-xs uppercase font-extrabold tracking-wider text-text-muted">
            खरेदी पावती
          </span>
          <p className="text-xl font-black text-stone-900">{slipNo}</p>
        </div>
        <div className="text-right">
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-bold ${
              smsStatus === "sent"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {smsStatus === "sent" ? "SMS पाठवला ✓" : "SMS प्रलंबित..."}
          </span>
        </div>
      </div>

      {/* Farmer & Crop */}
      <div>
        <p className="text-2xl font-black text-stone-900">{farmerName}</p>
        <p className="text-base font-bold text-brand">{crop}</p>
      </div>

      {/* Middle Specs */}
      <div className="bg-stone-50 p-3.5 rounded-xl border border-stone-200 grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-text-muted text-xs block">निव्वळ वजन</span>
          <span className="text-lg font-black text-stone-900">{netKg} किग्रॅ</span>
        </div>
        <div>
          <span className="text-text-muted text-xs block">ओलावा</span>
          <span className="text-lg font-black text-stone-900">{moisturePercent}%</span>
        </div>
        <div className="col-span-2 border-t border-stone-200 pt-2">
          <span className="text-text-muted text-xs block">दर प्रति क्विंटल</span>
          <span className="text-base font-bold text-stone-800">
            {formattedRate} / क्विंटल
          </span>
        </div>
      </div>

      {/* Amount Hero - Largest Visual Element */}
      <div className="bg-emerald-50 border-2 border-brand/30 p-4 rounded-xl text-center">
        <span className="text-xs font-bold text-brand uppercase tracking-wider block">
          एकूण देय रक्कम
        </span>
        <span className="text-4xl font-black text-stone-950 tracking-tight block my-1">
          {formattedAmount}
        </span>
        <span className="text-xs font-bold text-emerald-800 block">
          ४८ तासांत खात्यावर जमा होतील
        </span>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3 pt-2">
        {onShare && (
          <button
            type="button"
            onClick={onShare}
            className="min-h-touch bg-stone-900 text-white font-bold rounded-xl active:bg-stone-800 text-sm py-2 px-3"
          >
            शेअर करा (Share)
          </button>
        )}
        {onPrint && (
          <button
            type="button"
            onClick={onPrint}
            className="min-h-touch border-2 border-stone-800 font-bold rounded-xl active:bg-stone-100 text-sm py-2 px-3"
          >
            प्रिंट (Print)
          </button>
        )}
      </div>
    </div>
  );
};

