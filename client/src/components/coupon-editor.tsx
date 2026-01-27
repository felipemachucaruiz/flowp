import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { 
  Bold, 
  Italic, 
  AlignLeft, 
  AlignCenter, 
  AlignRight,
  Type,
  Sparkles,
  RotateCcw
} from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface CouponEditorProps {
  value: string;
  onChange: (value: string) => void;
  fontFamily?: string;
  baseFontSize?: number;
}

interface CouponContent {
  lines: CouponLine[];
}

interface CouponLine {
  text: string;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  size?: "small" | "normal" | "large" | "xlarge";
}

export function CouponEditor({ value, onChange, fontFamily = "monospace", baseFontSize = 12 }: CouponEditorProps) {
  const { t } = useI18n();
  const [lines, setLines] = useState<CouponLine[]>([]);
  const [selectedLineIndex, setSelectedLineIndex] = useState<number>(0);

  useEffect(() => {
    try {
      const parsed = JSON.parse(value);
      if (parsed.lines && Array.isArray(parsed.lines)) {
        setLines(parsed.lines);
      } else {
        setLines([{ text: value || "", align: "center", size: "normal" }]);
      }
    } catch {
      if (value) {
        const textLines = value.split('\n').map(text => ({ 
          text, 
          align: "center" as const, 
          size: "normal" as const 
        }));
        setLines(textLines.length > 0 ? textLines : [{ text: "", align: "center", size: "normal" }]);
      } else {
        setLines([{ text: "", align: "center", size: "normal" }]);
      }
    }
  }, []);

  const updateContent = (newLines: CouponLine[]) => {
    setLines(newLines);
    onChange(JSON.stringify({ lines: newLines }));
  };

  const updateLine = (index: number, updates: Partial<CouponLine>) => {
    const newLines = [...lines];
    newLines[index] = { ...newLines[index], ...updates };
    updateContent(newLines);
  };

  const addLine = () => {
    const newLines = [...lines, { text: "", align: "center" as const, size: "normal" as const }];
    updateContent(newLines);
    setSelectedLineIndex(newLines.length - 1);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 1) return;
    const newLines = lines.filter((_, i) => i !== index);
    updateContent(newLines);
    setSelectedLineIndex(Math.min(selectedLineIndex, newLines.length - 1));
  };

  const selectedLine = lines[selectedLineIndex] || lines[0];

  const getSizeMultiplier = (size?: string) => {
    switch (size) {
      case "small": return 0.85;
      case "large": return 1.3;
      case "xlarge": return 1.6;
      default: return 1;
    }
  };

  const resetToDefault = () => {
    const defaultLines: CouponLine[] = [
      { text: "10% OFF", bold: true, align: "center", size: "xlarge" },
      { text: t("printing.coupon_sample_line2"), align: "center", size: "normal" },
      { text: t("printing.coupon_sample_line3"), italic: true, align: "center", size: "small" },
    ];
    updateContent(defaultLines);
    setSelectedLineIndex(0);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => updateLine(selectedLineIndex, { bold: !selectedLine?.bold })}
          className={selectedLine?.bold ? "bg-muted" : ""}
          data-testid="button-coupon-bold"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => updateLine(selectedLineIndex, { italic: !selectedLine?.italic })}
          className={selectedLine?.italic ? "bg-muted" : ""}
          data-testid="button-coupon-italic"
        >
          <Italic className="h-4 w-4" />
        </Button>
        
        <Separator orientation="vertical" className="h-6" />
        
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => updateLine(selectedLineIndex, { align: "left" })}
          className={selectedLine?.align === "left" ? "bg-muted" : ""}
          data-testid="button-coupon-align-left"
        >
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => updateLine(selectedLineIndex, { align: "center" })}
          className={selectedLine?.align === "center" || !selectedLine?.align ? "bg-muted" : ""}
          data-testid="button-coupon-align-center"
        >
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => updateLine(selectedLineIndex, { align: "right" })}
          className={selectedLine?.align === "right" ? "bg-muted" : ""}
          data-testid="button-coupon-align-right"
        >
          <AlignRight className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="h-6" />

        <div className="flex items-center gap-1">
          <Type className="h-4 w-4 text-muted-foreground" />
          {(["small", "normal", "large", "xlarge"] as const).map((size) => (
            <Button
              key={size}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => updateLine(selectedLineIndex, { size })}
              className={`px-2 ${selectedLine?.size === size || (!selectedLine?.size && size === "normal") ? "bg-muted" : ""}`}
              data-testid={`button-coupon-size-${size}`}
            >
              <span style={{ fontSize: size === "small" ? "10px" : size === "large" ? "14px" : size === "xlarge" ? "16px" : "12px" }}>
                {size === "small" ? "S" : size === "normal" ? "M" : size === "large" ? "L" : "XL"}
              </span>
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
        {lines.map((line, index) => (
          <div 
            key={index} 
            className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
              selectedLineIndex === index ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"
            }`}
            onClick={() => setSelectedLineIndex(index)}
          >
            <span className="text-xs text-muted-foreground w-4">{index + 1}</span>
            <Input
              value={line.text}
              onChange={(e) => updateLine(index, { text: e.target.value })}
              placeholder={t("printing.coupon_line_placeholder")}
              className="flex-1 h-8"
              style={{
                fontWeight: line.bold ? "bold" : "normal",
                fontStyle: line.italic ? "italic" : "normal",
                textAlign: line.align || "center",
              }}
              data-testid={`input-coupon-line-${index}`}
            />
            {lines.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); removeLine(index); }}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                data-testid={`button-remove-line-${index}`}
              >
                ×
              </Button>
            )}
          </div>
        ))}
        
        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addLine}
            className="flex-1"
            data-testid="button-add-coupon-line"
          >
            + {t("printing.add_line")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetToDefault}
            data-testid="button-reset-coupon"
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            {t("common.reset")}
          </Button>
        </div>
      </div>

      <div className="border rounded-lg p-4 bg-white">
        <Label className="text-xs text-muted-foreground mb-2 block">{t("printing.coupon_preview")}</Label>
        <div 
          className="bg-white text-black py-3 px-2"
          style={{ 
            fontFamily,
            fontSize: `${baseFontSize}px`,
            minHeight: '80px'
          }}
        >
          <div className="text-center border-b-2 border-dashed border-gray-400 pb-2 mb-2">
            <span className="text-gray-500 text-sm">✂ - - - - - - - - - - - ✂</span>
          </div>
          {lines.map((line, index) => (
            <div
              key={index}
              style={{
                fontWeight: line.bold ? "bold" : "normal",
                fontStyle: line.italic ? "italic" : "normal",
                textAlign: line.align || "center",
                fontSize: `${baseFontSize * getSizeMultiplier(line.size)}px`,
                marginBottom: "4px",
              }}
            >
              {line.text || " "}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function renderCouponContent(value: string, fontFamily: string = "monospace", baseFontSize: number = 12): string {
  try {
    const parsed = JSON.parse(value);
    if (parsed.lines && Array.isArray(parsed.lines)) {
      return parsed.lines.map((line: CouponLine) => {
        const sizeMultiplier = line.size === "small" ? 0.85 : line.size === "large" ? 1.3 : line.size === "xlarge" ? 1.6 : 1;
        const fontSize = Math.round(baseFontSize * sizeMultiplier);
        const fontWeight = line.bold ? "bold" : "normal";
        const fontStyle = line.italic ? "italic" : "normal";
        const textAlign = line.align || "center";
        return `<div style="font-size: ${fontSize}px; font-weight: ${fontWeight}; font-style: ${fontStyle}; text-align: ${textAlign}; margin-bottom: 4px;">${line.text || "&nbsp;"}</div>`;
      }).join("");
    }
  } catch {
    return `<div style="text-align: center; white-space: pre-wrap;">${value}</div>`;
  }
  return `<div style="text-align: center; white-space: pre-wrap;">${value}</div>`;
}

export function getCouponPlainText(value: string): string {
  try {
    const parsed = JSON.parse(value);
    if (parsed.lines && Array.isArray(parsed.lines)) {
      return parsed.lines.map((line: CouponLine) => line.text).join('\n');
    }
  } catch {
    return value;
  }
  return value;
}
