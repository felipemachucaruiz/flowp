import { useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Delete } from "lucide-react";

interface PinPadProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  maxLength?: number;
  minLength?: number;
  disabled?: boolean;
  submitLabel?: string;
  autoSubmitLength?: number;
  active?: boolean;
}

export function PinPad({
  value,
  onChange,
  onSubmit,
  maxLength = 6,
  minLength = 4,
  disabled = false,
  submitLabel,
  autoSubmitLength,
  active = true,
}: PinPadProps) {
  const handleDigit = useCallback((digit: string) => {
    if (disabled || value.length >= maxLength) return;
    const newVal = value + digit;
    onChange(newVal);
    if (autoSubmitLength && newVal.length === autoSubmitLength && onSubmit) {
      onSubmit(newVal);
    }
  }, [disabled, value, maxLength, onChange, autoSubmitLength, onSubmit]);

  const handleBackspace = useCallback(() => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  }, [disabled, value, onChange]);

  const handleSubmitClick = useCallback(() => {
    if (disabled || value.length < minLength || !onSubmit) return;
    onSubmit(value);
  }, [disabled, value, minLength, onSubmit]);

  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === "Enter" && value.length >= minLength && onSubmit) {
        e.preventDefault();
        onSubmit(value);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, value, disabled, minLength, onSubmit, handleDigit, handleBackspace]);

  const dots = Array.from({ length: maxLength }, (_, i) => (
    <div
      key={i}
      className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
        i < value.length
          ? "bg-foreground border-foreground"
          : "border-muted-foreground/40"
      }`}
    />
  ));

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-[280px] mx-auto select-none">
      <div className="flex gap-2.5 justify-center min-h-[20px]" data-testid="pin-dots">
        {dots}
      </div>

      <div className="grid grid-cols-3 gap-2 w-full">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <Button
            key={digit}
            variant="outline"
            size="lg"
            className="text-xl font-medium"
            onClick={() => handleDigit(digit)}
            disabled={disabled || value.length >= maxLength}
            data-testid={`button-pin-${digit}`}
            type="button"
          >
            {digit}
          </Button>
        ))}
        <Button
          variant="outline"
          size="lg"
          onClick={handleBackspace}
          disabled={disabled || value.length === 0}
          data-testid="button-pin-backspace"
          type="button"
        >
          <Delete className="w-5 h-5" />
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="text-xl font-medium"
          onClick={() => handleDigit("0")}
          disabled={disabled || value.length >= maxLength}
          data-testid="button-pin-0"
          type="button"
        >
          0
        </Button>
        {onSubmit && !autoSubmitLength ? (
          <Button
            size="lg"
            className="text-sm font-medium"
            onClick={handleSubmitClick}
            disabled={disabled || value.length < minLength}
            data-testid="button-pin-submit"
            type="button"
          >
            {submitLabel || "OK"}
          </Button>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}
