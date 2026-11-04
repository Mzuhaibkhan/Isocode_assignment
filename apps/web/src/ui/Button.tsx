import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  size?: "default" | "large";
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
    "inline-flex items-center justify-center font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 min-h-touch min-w-touch select-none";

  const sizeClasses =
    size === "large" ? "px-6 py-4 text-xl" : "px-4 py-3 text-base";

  const variantClasses = {
    primary: disabled
      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
      : "bg-brand text-white hover:bg-brand-dark focus:ring-brand active:scale-[0.99]",
    secondary: disabled
      ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
      : "bg-white text-text-main border-2 border-stone-800 hover:bg-stone-100 focus:ring-stone-500",
    danger: disabled
      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
      : "bg-danger text-white hover:bg-red-800 focus:ring-danger",
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

