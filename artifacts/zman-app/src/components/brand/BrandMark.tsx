import Image from "next/image";
import { BRAND_ASSETS } from "@/lib/brand-tokens";

type BrandMarkProps = {
  size?: "sm" | "md" | "lg";
  decorative?: boolean;
  className?: string;
};

const sizeMap = {
  sm: { box: 36, image: 28 },
  md: { box: 56, image: 42 },
  lg: { box: 96, image: 72 },
} as const;

export function BrandMark({
  size = "md",
  decorative = false,
  className = "",
}: BrandMarkProps) {
  const metrics = sizeMap[size];

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[28%] bg-white shadow-sm ${className}`}
      style={{ width: metrics.box, height: metrics.box }}
    >
      <Image
        src={BRAND_ASSETS.rosette}
        alt={decorative ? "" : "Zman Greens"}
        width={metrics.image}
        height={metrics.image}
        priority={size === "lg"}
        aria-hidden={decorative}
      />
    </span>
  );
}
