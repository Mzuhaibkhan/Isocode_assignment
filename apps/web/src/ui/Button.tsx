import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "orange";
  size?: "default" | "large" | "small";
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "default",
  className = "",
  disabled,
  ...props
}) => {
  const baseClasses =
    "inline-flex items-center justify-center font-bold uppercase tracking-wider rounded-lg transition-all duration-150 select-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 min-h-touch btn-tactile";

  const sizeClasses = {
    small: "px-3 py-1.5 text-xs font-mono",
    default: "px-5 py-3 text-sm font-sans",
    large: "px-6 py-4 text-base font-display font-black tracking-normal text-lg",
  }[size];

  const variantClasses = {
    primary: disabled
      ? "bg-stone-300 text-stone-500 border border-stone-300 cursor-not-allowed shadow-none"
      : "bg-chaos-400 text-white border-2 border-chaos-400 hover:bg-chaos-charcoal hover:border-black active:bg-black shadow-tactile hover:shadow-tactile-md",
    secondary: disabled
      ? "bg-stone-200 text-stone-400 border border-stone-300 cursor-not-allowed shadow-none"
      : "bg-chaos-100 text-chaos-400 border-2 border-chaos-400 hover:bg-white hover:text-black shadow-tactile active:bg-stone-200",
    orange: disabled
      ? "bg-orange-200 text-orange-400 cursor-not-allowed shadow-none"
      : "bg-chaos-500 text-chaos-400 border-2 border-chaos-400 hover:bg-orange-500 font-black shadow-tactile active:bg-orange-600",
    danger: disabled
      ? "bg-red-200 text-red-400 cursor-not-allowed shadow-none"
      : "bg-danger text-white border-2 border-red-950 hover:bg-red-800 shadow-tactile active:bg-red-900",
  }[variant];

  return (
    <button
      disabled={disabled}
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
