import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";

interface DataRow {
  label: string;
  value: React.ReactNode;
  muted?: boolean;
}

interface MobileDataCardProps {
  title: string;
  subtitle?: string;
  badge?: { label: string; variant?: "default" | "secondary" | "destructive" | "outline" };
  icon?: React.ReactNode;
  rows?: DataRow[];
  onClick?: () => void;
  actions?: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}

export function MobileDataCard({
  title,
  subtitle,
  badge,
  icon,
  rows,
  onClick,
  actions,
  className,
  "data-testid": testId,
}: MobileDataCardProps) {
  return (
    <Card
      className={cn(
        "hover-elevate active-elevate-2",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
      data-testid={testId}
    >
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          {icon && (
            <div className="flex-shrink-0 mt-0.5">
              {icon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-sm truncate">{title}</h3>
              {badge && (
                <Badge variant={badge.variant || "secondary"} className="text-xs flex-shrink-0">
                  {badge.label}
                </Badge>
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground mb-2">{subtitle}</p>
            )}
            {rows && rows.length > 0 && (
              <div className="space-y-1">
                {rows.map((row, index) => (
                  <div key={index} className="flex items-center justify-between text-xs">
                    <span className={cn("text-muted-foreground", row.muted && "opacity-60")}>{row.label}</span>
                    <span className={cn("font-medium", row.muted && "opacity-60")}>{row.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {actions && (
            <div className="flex-shrink-0 flex items-center gap-1">
              {actions}
            </div>
          )}
          {onClick && !actions && (
            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface MobilePageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function MobilePageHeader({ title, subtitle, actions, className }: MobilePageHeaderProps) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4", className)}>
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground line-clamp-2">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
}

interface MobileSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}

export function MobileSearchBar({
  value,
  onChange,
  placeholder,
  icon,
  actions,
  className,
  "data-testid": testId,
}: MobileSearchBarProps) {
  return (
    <div className={cn("flex flex-col sm:flex-row gap-2 sm:gap-3", className)}>
      <div className="relative flex-1">
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
          {icon}
        </div>
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            icon && "pl-9"
          )}
          data-testid={testId}
        />
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
