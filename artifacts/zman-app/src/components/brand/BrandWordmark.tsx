import Image from "next/image";
import { BRAND_ASSETS } from "@/lib/brand-tokens";

type BrandWordmarkProps = {
  className?: string;
  priority?: boolean;
};

export function BrandWordmark({ className = "", priority = false }: BrandWordmarkProps) {
  return (
    <Image
      src={BRAND_ASSETS.wordmark}
      alt="Zman Greens"
      width={180}
      height={180}
      priority={priority}
      className={`h-auto w-full max-w-[180px] ${className}`}
    />
  );
}
