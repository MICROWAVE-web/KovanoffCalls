import { forwardRef, type ButtonHTMLAttributes } from "react";

export const PressableButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function PressableButton({ className = "", type = "button", ...rest }, ref) {
    return (
      <button ref={ref} type={type} className={["ui-pressable", className].filter(Boolean).join(" ")} {...rest} />
    );
  },
);
