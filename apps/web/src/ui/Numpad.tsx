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
    <div className="w-full max-w-sm mx-auto grid grid-cols-3 gap-2.5 p-2 bg-stone-100 rounded-2xl border-2 border-stone-300">
      {keys.flat().map((k, index) => {
        if (!k) {
          return <div key={index} className="min-h-[56px]" />;
        }

        if (k === "backspace") {
          return (
            <button
              key="backspace"
              type="button"
              onClick={onBackspace}
              className="min-h-[56px] min-w-touch flex items-center justify-center text-2xl font-bold bg-white text-stone-900 border-2 border-stone-400 rounded-xl active:bg-stone-200 select-none shadow-sm"
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
            className="min-h-[56px] min-w-touch flex items-center justify-center text-3xl font-extrabold bg-white text-text-main border-2 border-stone-800 rounded-xl active:bg-brand active:text-white select-none shadow-sm"
          >
            {k}
          </button>
        );
      })}
      <div className="col-span-3 pt-1">
        <button
          type="button"
          onClick={onClear}
          className="w-full min-h-touch py-2 text-base font-bold text-danger border-2 border-danger/40 bg-white rounded-xl active:bg-red-50"
        >
          साफ करा (Clear)
        </button>
      </div>
    </div>
  );
};

