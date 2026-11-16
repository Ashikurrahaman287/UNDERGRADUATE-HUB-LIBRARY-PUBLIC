import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
  sizes?: string;
};

const logoSource = "/books/ChatGPT%20Image%20Jun%2027,%202026,%2004_46_39%20PM.png";

export function BrandLogo({ className, priority = false, sizes = "180px" }: BrandLogoProps) {
  return (
    <Image
      alt="Undergraduate Hub"
      className={className}
      height={1254}
      priority={priority}
      sizes={sizes}
      src={logoSource}
      width={1254}
    />
  );
}