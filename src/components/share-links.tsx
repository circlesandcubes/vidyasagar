import { CopyLinkButton } from "@/components/copy-link-button";

export function ShareLinks({ url, title }: { url: string; title: string }) {
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(`${title} — ${url}`);
  const links = [
    { label: "WhatsApp", href: `https://wa.me/?text=${encodedText}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}` },
    { label: "Email", href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodedText}` },
  ];

  return (
    <section className="share" aria-labelledby="share-heading">
      <h2 id="share-heading">Share this book</h2>
      <ul className="share-list">
        {links.map((link) => (
          <li key={link.label}>
            <a href={link.href} rel="noopener noreferrer" target={link.label === "Email" ? undefined : "_blank"}>
              {link.label}
            </a>
          </li>
        ))}
        <li>
          <CopyLinkButton url={url} />
        </li>
      </ul>
    </section>
  );
}
