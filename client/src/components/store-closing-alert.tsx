import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, DoorClosed } from "lucide-react";

const DISMISSED_KEY = "store_closing_dismissed_date";

export function StoreClosingAlert() {
  const { tenant } = useAuth();
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const [showAlert, setShowAlert] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    const savedDate = localStorage.getItem(DISMISSED_KEY);
    return savedDate === new Date().toDateString();
  });

  const checkClosingTime = useCallback(() => {
    if (!tenant || !(tenant as any).storeHoursEnabled || !(tenant as any).storeCloseTime) {
      return;
    }

    const today = new Date().toDateString();
    const savedDate = localStorage.getItem(DISMISSED_KEY);
    if (savedDate === today) {
      return;
    }

    const closeTime = (tenant as any).storeCloseTime as string;
    const [closeHour, closeMinute] = closeTime.split(":").map(Number);

    const now = new Date();
    const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
    const closeTotalMinutes = closeHour * 60 + closeMinute;

    if (currentTotalMinutes >= closeTotalMinutes && currentTotalMinutes < closeTotalMinutes + 60) {
      setShowAlert(true);
    }
  }, [tenant]);

  useEffect(() => {
    checkClosingTime();
    const interval = setInterval(checkClosingTime, 30000);
    return () => clearInterval(interval);
  }, [checkClosingTime]);

  const dismiss = () => {
    setShowAlert(false);
    setDismissed(true);
    localStorage.setItem(DISMISSED_KEY, new Date().toDateString());
  };

  const handleCloseRegister = () => {
    dismiss();
    navigate("/cash-register");
  };

  const handleContinue = () => {
    dismiss();
  };

  return (
    <Dialog open={showAlert} onOpenChange={(open) => { if (!open) handleContinue(); }}>
      <DialogContent className="max-w-sm" data-testid="dialog-store-closing">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-store-closing-title">
            <Clock className="h-5 w-5 text-orange-500" />
            {t("store_closing.title")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground" data-testid="text-store-closing-message">
          {t("store_closing.message")}
        </p>
        <DialogFooter className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={handleContinue} data-testid="button-store-closing-continue">
            {t("store_closing.continue")}
          </Button>
          <Button onClick={handleCloseRegister} data-testid="button-store-closing-close">
            <DoorClosed className="mr-2 h-4 w-4" />
            {t("store_closing.close_register")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
