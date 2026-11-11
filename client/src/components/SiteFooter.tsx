import { Link } from 'react-router-dom';

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { to: '/create', label: 'Create' },
      { to: '/upscale', label: 'Upscale' },
      { to: '/dashboard', label: 'Dashboard' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { to: '/#how', label: 'How it works' },
      { to: '/#limits', label: 'Limits' },
      { to: '/#faq', label: 'FAQ' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="container mx-auto flex flex-col gap-8 px-4 py-10 md:flex-row md:justify-between">
        <div className="max-w-xs space-y-2">
          <p className="font-light tracking-tight">Aether AI</p>
          <p className="text-sm text-muted-foreground">
            A small text-to-image model trained from random weights. 16.3M parameters, 64x64 output.
          </p>
        </div>
        <nav aria-label="Footer" className="flex gap-12">
          {COLUMNS.map((column) => (
            <div key={column.title} className="space-y-2">
              <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{column.title}</h2>
              <ul className="space-y-1.5 text-sm">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.to.startsWith('/#') ? (
                      <a href={link.to} className="underline-offset-4 hover:underline">
                        {link.label}
                      </a>
                    ) : (
                      <Link to={link.to} className="underline-offset-4 hover:underline">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <p className="container mx-auto px-4 pb-8 font-mono text-xs text-muted-foreground">
        Licensed under Apache-2.0. Outputs carry a provenance chunk.
      </p>
    </footer>
  );
}
