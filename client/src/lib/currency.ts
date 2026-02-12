const LOCALE_MAP: Record<string, string> = {
  COP: "es-CO",
  MXN: "es-MX",
  ARS: "es-AR",
  PEN: "es-PE",
  CLP: "es-CL",
  EUR: "de-DE",
  GBP: "en-GB",
  JPY: "ja-JP",
  CNY: "zh-CN",
  KRW: "ko-KR",
  USD: "en-US",
  CAD: "en-CA",
  AUD: "en-AU",
  BRL: "pt-BR",
};

const ZERO_DECIMAL_CURRENCIES = new Set(["COP", "CLP", "JPY", "KRW"]);

export function getCurrencyLocale(currency: string): string {
  return LOCALE_MAP[currency] || "en-US";
}

export function getCurrencyDecimals(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
}

export function getThousandsSeparator(currency: string): string {
  const locale = getCurrencyLocale(currency);
  const parts = new Intl.NumberFormat(locale).formatToParts(1234567);
  const groupPart = parts.find((p) => p.type === "group");
  return groupPart?.value || ",";
}

export function getDecimalSeparator(currency: string): string {
  const locale = getCurrencyLocale(currency);
  const parts = new Intl.NumberFormat(locale).formatToParts(1.1);
  const decimalPart = parts.find((p) => p.type === "decimal");
  return decimalPart?.value || ".";
}

export function formatCurrency(amount: number, currency: string = "USD"): string {
  const locale = getCurrencyLocale(currency);
  const decimals = getCurrencyDecimals(currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(decimals)}`;
  }
}

export function formatNumber(amount: number, currency: string = "USD"): string {
  const locale = getCurrencyLocale(currency);
  const decimals = getCurrencyDecimals(currency);
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    return amount.toFixed(decimals);
  }
}

export function parseCurrencyInput(value: string, currency: string = "USD"): number {
  const thousandsSep = getThousandsSeparator(currency);
  const decimalSep = getDecimalSeparator(currency);

  let cleaned = value.replace(/[^\d]/g, "");

  if (!cleaned) return 0;

  const decimals = getCurrencyDecimals(currency);
  if (decimals > 0) {
    cleaned = cleaned.padStart(decimals + 1, "0");
    const intPart = cleaned.slice(0, -decimals);
    const decPart = cleaned.slice(-decimals);
    return parseFloat(`${intPart}.${decPart}`);
  }

  return parseInt(cleaned, 10);
}

export function formatCurrencyInput(value: number, currency: string = "USD"): string {
  const locale = getCurrencyLocale(currency);
  const decimals = getCurrencyDecimals(currency);
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: true,
    }).format(value);
  } catch {
    return value.toFixed(decimals);
  }
}
