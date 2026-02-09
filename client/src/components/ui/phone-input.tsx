import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { PHONE_COUNTRY_CODES } from "@shared/phoneCountryCodes";
import { ChevronDown, Search, Globe } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PhoneInputProps {
  value: string;
  countryCode: string;
  onPhoneChange: (phone: string) => void;
  onCountryCodeChange: (code: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
  disabled?: boolean;
}

export function PhoneInput({
  value,
  countryCode,
  onPhoneChange,
  onCountryCodeChange,
  placeholder = "",
  className,
  "data-testid": testId,
  disabled,
}: PhoneInputProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = PHONE_COUNTRY_CODES.find((c) => c.code === countryCode) || PHONE_COUNTRY_CODES[0];

  const filtered = search
    ? PHONE_COUNTRY_CODES.filter(
        (c) =>
          c.country.toLowerCase().includes(search.toLowerCase()) ||
          c.code.includes(search)
      )
    : PHONE_COUNTRY_CODES;

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 0);
    } else {
      setSearch("");
    }
  }, [open]);

  return (
    <div className={cn("flex gap-0", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="shrink-0 rounded-r-none border-r-0 px-2 gap-1"
            data-testid={testId ? `${testId}-country` : "phone-country-select"}
          >
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs">+{selected.code}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <div className="flex items-center gap-2 border-b px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              data-testid="input-phone-country-search"
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto py-1">
            {filtered.map((c) => (
              <button
                key={c.code + c.flag}
                type="button"
                onClick={() => {
                  onCountryCodeChange(c.code);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-2 py-1.5 text-sm hover-elevate",
                  c.code === countryCode && "bg-accent"
                )}
                data-testid={`phone-country-option-${c.code}`}
              >
                <span className="w-6 text-center text-xs font-medium text-muted-foreground">{c.flag}</span>
                <span className="flex-1 text-left truncate">{c.country}</span>
                <span className="text-xs text-muted-foreground">+{c.code}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                No encontrado
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <Input
        type="tel"
        value={value}
        onChange={(e) => onPhoneChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="rounded-l-none"
        data-testid={testId || "input-phone"}
      />
    </div>
  );
}
