import { useTheme } from "@/lib/theme-provider";
import flowpLogoDark from "@assets/Sin_título-1_1769033877071.webp";
import flowpLogoLight from "@assets/flowpwhite_1769679196942.webp";

interface FlowpLogoProps {
  className?: string;
  alt?: string;
}

export function FlowpLogo({ className = "h-8", alt = "Flowp" }: FlowpLogoProps) {
  const { theme } = useTheme();
  const logo = theme === "dark" ? flowpLogoLight : flowpLogoDark;
  
  return <img src={logo} alt={alt} className={className} />;
}
