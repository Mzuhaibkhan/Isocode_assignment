import React from "react";

export interface StepShellProps {
  stepCurrent?: number;
  stepTotal?: number;
  title: string;
  centreCode?: string;
  isOnline?: boolean;
  priceDate?: string;
  onBack?: () => void;
  children: React.ReactNode;
}

export const StepShell: React.FC<StepShellProps> = ({
  stepCurrent,
  stepTotal = 4,
  title,
  centreCode = "C07",
  isOnline = true,
  priceDate = "आजचा दर",
  onBack,
  children,
}) => {
  const progressPercent = stepCurrent ? (stepCurrent / stepTotal) * 100 : 0;

  return (
    <div className="min-h-[85vh] bg-chaos-100 flex flex-col max-w-lg mx-auto border-2 border-chaos-400 rounded-2xl shadow-tactile-lg overflow-hidden my-2 sm:my-4">
      {/* Top Status Bar (§13.3) */}
      <header className="bg-chaos-400 text-chaos-100 px-4 py-2.5 flex items-center justify-between text-xs font-mono font-bold select-none border-b-2 border-chaos-400">
        <div className="flex items-center gap-2">
          <span className="bg-chaos-500 text-chaos-400 px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider">
            केंद्र {centreCode}
          </span>
          <span className="text-chaos-200 text-[11px]">{priceDate}</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${
              isOnline ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-red-400"
            }`}
          />
          <span className="text-chaos-100 uppercase tracking-wider text-[11px]">
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>
      </header>

      {/* Progress Line */}
      {stepCurrent && (
        <div className="w-full bg-chaos-200 h-1.5 overflow-hidden">
          <div
            className="bg-chaos-500 h-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Navigation & Step Info */}
      <div className="bg-white px-4 py-3 border-b-2 border-chaos-200 flex items-center justify-between">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="min-h-[38px] px-3 flex items-center gap-1 text-chaos-400 font-mono text-xs font-black uppercase tracking-wider border border-chaos-300 rounded hover:bg-chaos-100 active:translate-y-[1px] transition-all"
            aria-label="मागे जा"
          >
            ← Back
          </button>
        ) : (
          <div className="w-16" />
        )}
        <div className="text-center">
          {stepCurrent && (
            <p className="text-[11px] font-mono font-black text-chaos-500 uppercase tracking-widest">
              STEP {stepCurrent} OF {stepTotal}
            </p>
          )}
          <h2 className="text-2xl sm:text-3xl font-display font-black text-chaos-400 tracking-tight">
            {title}
          </h2>
        </div>
        <div className="w-16" />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-5 flex flex-col justify-between bg-chaos-100/60">
        {children}
      </main>
    </div>
  );
};
