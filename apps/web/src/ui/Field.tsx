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
    <div className="flex flex-col gap-1 w-full">
      <label htmlFor={inputId} className="text-sm font-bold text-text-main">
        {label}
      </label>
      <input
        id={inputId}
        className={`w-full min-h-touch px-4 py-3 rounded-lg border-2 text-lg text-text-main bg-white transition-colors focus:outline-none focus:ring-2 ${
          error
            ? "border-danger focus:border-danger focus:ring-danger/20"
            : "border-stone-700 focus:border-brand focus:ring-brand/20"
        } ${className}`}
        {...props}
      />
      {error && <span className="text-sm font-semibold text-danger">{error}</span>}
      {helperText && !error && (
        <span className="text-sm text-text-muted">{helperText}</span>
      )}
    </div>
  );
};

