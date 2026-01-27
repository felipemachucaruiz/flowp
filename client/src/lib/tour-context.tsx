import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";
import { useAuth } from "./auth-context";

export interface TourStep {
  id: string;
  titleKey: string;
  descriptionKey: string;
  page?: string;
  elementSelector?: string;
  tenantType?: "retail" | "restaurant";
}

interface TourContextType {
  isActive: boolean;
  currentStep: number;
  steps: TourStep[];
  startTour: () => void;
  endTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (index: number) => void;
  getCurrentStep: () => TourStep | null;
}

const TourContext = createContext<TourContextType | null>(null);

const allTourSteps: TourStep[] = [
  { id: "welcome", titleKey: "tour.welcome_title", descriptionKey: "tour.welcome_desc" },
  { id: "sidebar", titleKey: "tour.sidebar_title", descriptionKey: "tour.sidebar_desc", elementSelector: "[data-tour='sidebar']" },
  { id: "pos", titleKey: "tour.pos_title", descriptionKey: "tour.pos_desc", page: "/pos" },
  { id: "pos_products", titleKey: "tour.pos_products_title", descriptionKey: "tour.pos_products_desc", page: "/pos", elementSelector: "[data-tour='pos-products']" },
  { id: "pos_cart", titleKey: "tour.pos_cart_title", descriptionKey: "tour.pos_cart_desc", page: "/pos", elementSelector: "[data-tour='pos-cart']" },
  { id: "tables", titleKey: "tour.tables_title", descriptionKey: "tour.tables_desc", page: "/tables", tenantType: "restaurant" },
  { id: "kitchen", titleKey: "tour.kitchen_title", descriptionKey: "tour.kitchen_desc", page: "/kitchen", tenantType: "restaurant" },
  { id: "products", titleKey: "tour.products_title", descriptionKey: "tour.products_desc", page: "/products" },
  { id: "inventory", titleKey: "tour.inventory_title", descriptionKey: "tour.inventory_desc", page: "/inventory" },
  { id: "purchasing", titleKey: "tour.purchasing_title", descriptionKey: "tour.purchasing_desc", page: "/purchasing" },
  { id: "customers", titleKey: "tour.customers_title", descriptionKey: "tour.customers_desc", page: "/customers" },
  { id: "sales_history", titleKey: "tour.sales_history_title", descriptionKey: "tour.sales_history_desc", page: "/sales-history" },
  { id: "reports", titleKey: "tour.reports_title", descriptionKey: "tour.reports_desc", page: "/reports" },
  { id: "settings", titleKey: "tour.settings_title", descriptionKey: "tour.settings_desc", page: "/settings" },
  { id: "complete", titleKey: "tour.complete_title", descriptionKey: "tour.complete_desc" },
];

export function TourProvider({ children }: { children: ReactNode }) {
  const { tenant } = useAuth();
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const tourSteps = useMemo(() => {
    const tenantType = tenant?.type || "retail";
    return allTourSteps.filter(step => !step.tenantType || step.tenantType === tenantType);
  }, [tenant?.type]);

  const startTour = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const endTour = useCallback(() => {
    setIsActive(false);
    setCurrentStep(0);
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      endTour();
    }
  }, [currentStep, endTour]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const goToStep = useCallback((index: number) => {
    if (index >= 0 && index < tourSteps.length) {
      setCurrentStep(index);
    }
  }, []);

  const getCurrentStep = useCallback(() => {
    return tourSteps[currentStep] || null;
  }, [currentStep]);

  return (
    <TourContext.Provider value={{
      isActive,
      currentStep,
      steps: tourSteps,
      startTour,
      endTour,
      nextStep,
      prevStep,
      goToStep,
      getCurrentStep
    }}>
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error("useTour must be used within a TourProvider");
  }
  return context;
}
