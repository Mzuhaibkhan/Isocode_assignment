import React from "react";

export interface NumpadProps {
  onDigit: (digit: string) => void;
  onClear: () => void;
  onBackspace: () => void;
  allowDecimal?: boolean;
}

export const Numpad: React.FC<NumpadProps> = ({
  onDigit,
  onClear,
  onBackspace,
  allowDecimal = true,
}) => {
  const keys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    [allowDecimal ? "." : "", "0", "backspace"],
  ];

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col gap-2 p-3 bg-chaos-100 rounded-xl border-2 border-chaos-400 shadow-tactile">
      <div className="grid grid-cols-3 gap-2">
        {keys.flat().map((k, index) => {
          if (!k) {
            return <div key={index} className="min-h-[58px]" />;
          }

          if (k === "backspace") {
            return (
              <button
                key="backspace"
                type="button"
                onClick={onBackspace}
                className="min-h-[58px] min-w-touch flex items-center justify-center text-xl font-mono font-black bg-white text-chaos-400 border-2 border-chaos-400 rounded-lg active:translate-y-[2px] transition-all shadow-tactile select-none hover:bg-stone-50"
                aria-label="Backspace"
              >
                ⌫
              </button>
            );
          }

          return (
            <button
              key={k}
              type="button"
              onClick={() => onDigit(k)}
              className="min-h-[58px] min-w-touch flex items-center justify-center font-display text-3xl sm:text-4xl font-black bg-white text-chaos-400 border-2 border-chaos-400 rounded-lg active:translate-y-[2px] active:bg-chaos-500 transition-all shadow-tactile select-none hover:bg-stone-50"
            >
              {k}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onClear}
        className="w-full min-h-[44px] py-2 font-mono text-xs font-black uppercase tracking-wider text-red-900 border-2 border-red-900/60 bg-red-50 hover:bg-red-100 rounded-lg active:translate-y-[1px] transition-all"
      >
        सर्व खोडा (Clear All)
      </button>
    </div>
  );
};
