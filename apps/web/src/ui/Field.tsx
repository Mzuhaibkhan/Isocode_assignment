import React from "react";

export interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
}

export const Field: React.FC<FieldProps> = ({
  label,
  error,
  helperText,
  id,
  className = "",
  ...props
}) => {
  const inputId = id || label.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="flex flex-col gap-1.5 w-full font-sans">
      <label
        htmlFor={inputId}
        className="font-mono text-xs uppercase font-bold tracking-wider text-chaos-black flex items-center justify-between"
      >
        <span>{label}</span>
      </label>
      <input
        id={inputId}
        className={`w-full min-h-[48px] px-3.5 py-2.5 rounded-none border-2 text-base font-medium text-chaos-black bg-chaos-paper transition-all focus:outline-none focus:bg-white ${
          error
            ? "border-red-600 shadow-[0_2px_0_0_#dc2626]"
            : "border-chaos-black focus:shadow-tactile-orange"
        } ${className}`}
        {...props}
      />
      {error && (
        <span className="font-mono text-xs font-bold text-red-600 uppercase tracking-wide">
          [!] {error}
        </span>
      )}
      {helperText && !error && (
        <span className="font-mono text-xs text-chaos-muted tracking-tight">{helperText}</span>
      )}
    </div>
  );
};
