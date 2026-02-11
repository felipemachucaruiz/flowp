import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { Lock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS } from "input-otp";

export function LockScreen() {
  const { user, tenant, logout } = useAuth();
  const { t } = useI18n();
  const [isLocked, setIsLocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockedRef = useRef(false);

  const autoLockEnabled = (tenant as any)?.autoLockEnabled === true;
  const autoLockTimeout = ((tenant as any)?.autoLockTimeout || 5) * 60 * 1000;
  const userHasPin = !!(user as any)?.hasPin;

  const resetTimer = useCallback(() => {
    if (!autoLockEnabled || !userHasPin || lockedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lockedRef.current = true;
      setIsLocked(true);
      setPin("");
      setError("");
    }, autoLockTimeout);
  }, [autoLockEnabled, autoLockTimeout, userHasPin]);

  useEffect(() => {
    if (!autoLockEnabled || !userHasPin) return;

    const events = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "click"];
    const handler = () => resetTimer();

    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    resetTimer();

    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [autoLockEnabled, userHasPin, resetTimer]);

  const handlePinComplete = async (value: string) => {
    if (value.length < 4 || isVerifying) return;
    setIsVerifying(true);
    setError("");
    try {
      const res = await fetch("/api/auth/verify-pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user?.id || "",
          "x-tenant-id": (tenant as any)?.id || "",
        },
        body: JSON.stringify({ pin: value }),
      });
      if (res.ok) {
        lockedRef.current = false;
        setIsLocked(false);
        setPin("");
        resetTimer();
      } else {
        setError(t("lock_screen.invalid_pin"));
        setPin("");
      }
    } catch {
      setError(t("lock_screen.error"));
      setPin("");
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isLocked || !autoLockEnabled || !userHasPin) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-6 p-8 max-w-sm w-full">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <Lock className="w-8 h-8 text-muted-foreground" />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-xl font-semibold" data-testid="text-lock-screen-title">{t("lock_screen.title")}</h2>
          <p className="text-sm text-muted-foreground" data-testid="text-lock-screen-user">{user?.name}</p>
          <p className="text-sm text-muted-foreground">{t("lock_screen.enter_pin")}</p>
        </div>
        <InputOTP
          maxLength={4}
          value={pin}
          onChange={(val) => {
            setPin(val);
            setError("");
            if (val.length === 4) handlePinComplete(val);
          }}
          pattern={REGEXP_ONLY_DIGITS}
          data-testid="input-lock-pin"
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
          </InputOTPGroup>
        </InputOTP>
        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm" data-testid="text-lock-error">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={logout} data-testid="button-lock-logout">
          {t("lock_screen.logout")}
        </Button>
      </div>
    </div>
  );
}
