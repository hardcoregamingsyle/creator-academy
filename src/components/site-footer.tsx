import Link from "next/link";
import { site } from "@/lib/site";
import { activeSocials } from "@/lib/data/socials";
import { Logo, socialIcons } from "./brand";
import { Container } from "./ui";

const columns = [
  {
    title: "Learn",
    links: [
      { href: "/classes", label: "All classes" },
      { href: "/monthly-pass", label: "Monthly Pass" },
      { href: "/schedule", label: "Upcoming schedule" },
      { href: "/personal-training", label: "Personal training" },
      { href: "/feedback", label: "Class feedback" },
    ],
  },
  {
    title: "Help",
    links: [
      { href: "/faq", label: "FAQ" },
      { href: "/contact", label: "Contact us" },
      { href: "/about", label: "About" },
      { href: "/booking", label: "Find my booking" },
    ],
  },
  {
    title: "Policies",
    links: [
      { href: "/policies/terms", label: "Terms & conditions" },
      { href: "/policies/privacy", label: "Privacy policy" },
      { href: "/policies/refunds", label: "Cancellations & refunds" },
      { href: "/policies/delivery", label: "Class delivery policy" },
    ],
  },
];

export async function SiteFooter() {
  const year = new Date().getFullYear();
  const legalName = process.env.NEXT_PUBLIC_LEGAL_NAME;
  const socials = await activeSocials();
  return (
    <footer className="bg-deep text-on-dark">
      <Container className="py-14 sm:py-16">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_2fr]">
          <div className="max-w-sm">
            <Logo dark />
            <p className="mt-4 text-on-dark-muted">
              Practical creator skills through live, 90-minute workshops and personal training. Leave every class with
              something you made.
            </p>
            <ul className="mt-6 flex items-center gap-2" aria-label="Social media">
              {socials.map((s) => {
                const Icon = socialIcons[s.platform as keyof typeof socialIcons];
                return (
                  <li key={s.id}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex size-10 items-center justify-center rounded-full border border-dark-line text-on-dark hover:bg-dark-surface"
                      aria-label={`${site.name} on ${s.platform}`}
                    >
                      <Icon className="size-[18px]" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {columns.map((col) => (
              <div key={col.title}>
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-on-dark-muted">{col.title}</p>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="text-[15px] text-on-dark/90 hover:text-white hover:underline">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-14 flex flex-col gap-3 border-t border-dark-line pt-6 text-sm text-on-dark-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {site.name}
            {legalName ? ` · Operated by ${legalName}` : ""}
          </p>
          <p>
            Questions?{" "}
            <a href={`mailto:${site.contactEmail}`} className="text-on-dark hover:underline">
              {site.contactEmail}
            </a>
          </p>
        </div>
      </Container>
    </footer>
  );
}
