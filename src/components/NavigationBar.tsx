const menuItems = [
  { label: 'Home', href: '#home', active: true },
  { label: 'Studio', href: '#studio', active: false },
  { label: 'About', href: '#about', active: false },
  { label: 'Journal', href: '#journal', active: false },
  { label: 'Reach Us', href: '#reach-us', active: false },
];

export default function NavigationBar() {
  return (
    <nav className="relative z-10 w-full">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-6">
        <a
          href="#home"
          className="font-serif text-3xl tracking-tight text-black"
          style={{ fontFamily: "'Instrument Serif', serif", color: '#000000' }}
        >
          Aether<sup className="text-sm align-super">®</sup>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {menuItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="text-sm transition-colors duration-200"
              style={{
                color: item.active ? '#000000' : '#6F6F6F',
                fontFamily: "'Inter', sans-serif",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = '#000000';
              }}
              onMouseLeave={(e) => {
                if (!item.active) {
                  (e.currentTarget as HTMLElement).style.color = '#6F6F6F';
                }
              }}
            >
              {item.label}
            </a>
          ))}
        </div>

        <a
          href="#studio"
          className="hidden rounded-full px-6 py-2.5 text-sm text-white transition-transform duration-200 hover:scale-105 md:block"
          style={{ backgroundColor: '#000000', fontFamily: "'Inter', sans-serif" }}
        >
          Begin Journey
        </a>
      </div>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-8 pb-2 md:hidden">
        <div className="flex gap-4 overflow-x-auto">
          {menuItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="shrink-0 text-sm transition-colors duration-200"
              style={{
                color: item.active ? '#000000' : '#6F6F6F',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {item.label}
            </a>
          ))}
        </div>
        <a
          href="#studio"
          className="rounded-full px-6 py-2.5 text-sm text-white transition-transform duration-200 hover:scale-105"
          style={{ backgroundColor: '#000000', fontFamily: "'Inter', sans-serif" }}
        >
          Begin Journey
        </a>
      </div>
    </nav>
  );
}
