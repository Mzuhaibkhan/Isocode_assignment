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
  return (
    <div className="min-h-screen bg-bg-main flex flex-col max-w-md mx-auto border-x border-stone-200">
      {/* Top Status Bar */}
      <header className="bg-stone-900 text-white px-4 py-2.5 flex items-center justify-between text-xs font-semibold select-none">
        <div className="flex items-center gap-2">
          <span className="bg-stone-800 px-2 py-0.5 rounded text-amber-300 font-bold">
            केंद्र: {centreCode}
          </span>
          <span className="text-stone-300">{priceDate}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${
              isOnline ? "bg-emerald-400" : "bg-red-400"
            }`}
          />
          <span className="text-stone-200">
            {isOnline ? "ऑनलाइन" : "ऑफलाइन"}
          </span>
        </div>
      </header>

      {/* Navigation & Step Info */}
      <div className="bg-white px-4 py-3 border-b-2 border-stone-200 flex items-center justify-between">
        {onBack ? (
          <button
            onClick={onBack}
            className="min-h-touch px-3 flex items-center text-stone-700 font-bold text-base active:text-black"
            aria-label="मागे जा"
          >
            ← मागे
          </button>
        ) : (
          <div className="w-12" />
        )}
        <div className="text-center">
          {stepCurrent && (
            <p className="text-xs font-bold text-brand uppercase tracking-wider">
              पायरी {stepCurrent} / {stepTotal}
            </p>
          )}
          <h1 className="text-xl font-extrabold text-text-main">{title}</h1>
        </div>
        <div className="w-12" />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-4 flex flex-col justify-between">
        {children}
      </main>
    </div>
  );
};

