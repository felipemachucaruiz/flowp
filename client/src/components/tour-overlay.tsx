import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useTour } from "@/lib/tour-context";
import { useI18n, TranslationKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { X, ChevronLeft, ChevronRight, HelpCircle, Check } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export function TourOverlay() {
  const { isActive, currentStep, steps, nextStep, prevStep, endTour, getCurrentStep } = useTour();
  const { t } = useI18n();
  const [location, navigate] = useLocation();
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  
  const step = getCurrentStep();
  const progress = ((currentStep + 1) / steps.length) * 100;
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  useEffect(() => {
    if (isActive && step?.page && location !== step.page) {
      navigate(step.page);
    }
  }, [isActive, step, location, navigate]);

  useEffect(() => {
    if (!isActive || !step?.elementSelector) {
      setHighlightRect(null);
      return;
    }

    const timeout = setTimeout(() => {
      const element = document.querySelector(step.elementSelector!);
      if (element) {
        const rect = element.getBoundingClientRect();
        setHighlightRect(rect);
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        setHighlightRect(null);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [isActive, step, currentStep]);

  if (!isActive || !step) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={endTour}
      />
      
      {highlightRect && (
        <div 
          className="absolute border-4 border-primary rounded-lg pointer-events-none animate-pulse"
          style={{
            top: highlightRect.top - 4,
            left: highlightRect.left - 4,
            width: highlightRect.width + 8,
            height: highlightRect.height + 8,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
            zIndex: 101,
          }}
        />
      )}
      
      <Card ref={cardRef} className="relative z-[102] w-full max-w-lg mx-4 shadow-2xl border-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                {currentStep + 1}
              </div>
              <CardTitle className="text-lg">
                {t(step.titleKey as TranslationKey)}
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={endTour}
              data-testid="button-tour-close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Progress value={progress} className="h-1.5 mt-3" />
          <p className="text-xs text-muted-foreground mt-1">
            {t("tour.step_of").replace("{current}", String(currentStep + 1)).replace("{total}", String(steps.length))}
          </p>
        </CardHeader>
        
        <CardContent className="pb-4">
          <p className="text-muted-foreground leading-relaxed">
            {t(step.descriptionKey as TranslationKey)}
          </p>
          
          {step.page && (
            <div className="mt-4 p-3 rounded-lg bg-muted/50">
              <p className="text-sm flex items-center gap-2">
                <span className="font-medium">{t("tour.current_page")}:</span>
                <code className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs">
                  {step.page}
                </code>
              </p>
            </div>
          )}
        </CardContent>
        
        <CardFooter className="flex justify-between gap-2 pt-0">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={isFirstStep}
            data-testid="button-tour-prev"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {t("tour.previous")}
          </Button>
          
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={endTour}
              data-testid="button-tour-skip"
            >
              {t("tour.skip")}
            </Button>
            
            <Button
              onClick={nextStep}
              data-testid="button-tour-next"
            >
              {isLastStep ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  {t("tour.finish")}
                </>
              ) : (
                <>
                  {t("tour.next")}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

export function TourButton() {
  const { startTour } = useTour();
  const { t } = useI18n();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={startTour}
      className="gap-2"
      data-testid="button-start-tour"
    >
      <HelpCircle className="h-4 w-4" />
      <span className="hidden sm:inline">{t("tour.start_tour")}</span>
    </Button>
  );
}
