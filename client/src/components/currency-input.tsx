import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { formatCurrencyInput, getCurrencyDecimals, getDecimalSeparator, getThousandsSeparator } from "@/lib/currency";

function getCurrencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).formatToParts(0);
    const symbolPart = parts.find(p => p.type === "currency");
    return symbolPart?.value || "";
  } catch {
    return "";
  }
}

interface CurrencyInputProps {
  value: string | number;
  onChange: (value: string) => void;
  currency?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  "data-testid"?: string;
}

export function CurrencyInput({
  value,
  onChange,
  currency = "USD",
  placeholder,
  className,
  disabled,
  id,
  "data-testid": dataTestId,
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isUserTyping = useRef(false);

  useEffect(() => {
    if (isUserTyping.current) return;
    const numValue = typeof value === "string" ? parseFloat(value) || 0 : value;
    if (numValue === 0) {
      setDisplayValue("");
    } else {
      setDisplayValue(formatCurrencyInput(numValue, currency));
    }
  }, [value, currency]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    isUserTyping.current = true;
    const rawInput = e.target.value;
    const decimals = getCurrencyDecimals(currency);
    const decimalSep = getDecimalSeparator(currency);
    const thousandsSep = getThousandsSeparator(currency);

    const digitsOnly = rawInput.replace(/[^\d]/g, "");

    if (!digitsOnly) {
      setDisplayValue("");
      onChange("0");
      isUserTyping.current = false;
      return;
    }

    let numericValue: number;
    let formatted: string;

    if (decimals > 0) {
      const padded = digitsOnly.padStart(decimals + 1, "0");
      const intPart = padded.slice(0, -decimals).replace(/^0+(?=\d)/, "") || "0";
      const decPart = padded.slice(-decimals);
      numericValue = parseFloat(`${intPart}.${decPart}`);

      const intFormatted = new Intl.NumberFormat(undefined, { useGrouping: true })
        .format(parseInt(intPart, 10))
        .replace(/,/g, thousandsSep === "." ? "." : ",");

      formatted = `${intFormatted}${decimalSep}${decPart}`;
    } else {
      numericValue = parseInt(digitsOnly, 10);
      formatted = formatCurrencyInput(numericValue, currency);
    }

    setDisplayValue(formatted);
    onChange(numericValue.toString());

    setTimeout(() => {
      isUserTyping.current = false;
    }, 50);
  };

  const symbol = getCurrencySymbol(currency);

  return (
    <div className="relative">
      {symbol && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
          {symbol}
        </span>
      )}
      <Input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder || "0"}
        className={`${symbol ? "pl-8" : ""} ${className || ""}`}
        disabled={disabled}
        data-testid={dataTestId}
      />
    </div>
  );
}
