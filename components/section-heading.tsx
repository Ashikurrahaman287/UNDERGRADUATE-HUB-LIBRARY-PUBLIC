import Link from "next/link";

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  linkHref?: string;
  linkLabel?: string;
};

export function SectionHeading({ eyebrow, title, linkHref, linkLabel }: SectionHeadingProps) {
  return (
    <div className="section-heading">
      <div><p className="eyebrow">{eyebrow}</p><h2 className="display-font">{title}</h2></div>
      {linkHref && linkLabel ? <Link className="text-link section-heading-link" href={linkHref}>{linkLabel}<span aria-hidden="true">→</span></Link> : null}
    </div>
  );
}