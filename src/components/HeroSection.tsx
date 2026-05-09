export default function HeroSection() {
  return (
    <section
      className="relative z-10 flex flex-col items-center justify-center px-6 text-center"
      style={{ paddingTop: 'calc(8rem - 75px)', paddingBottom: '10rem' }}
    >
      <h1
        className="animate-fade-rise max-w-7xl text-5xl font-normal text-black sm:text-7xl md:text-8xl"
        style={{
          fontFamily: "'Instrument Serif', serif",
          lineHeight: 0.95,
          letterSpacing: '-2.46px',
          color: '#000000',
        }}
      >
        Beyond{' '}
        <em style={{ color: '#6F6F6F', fontStyle: 'italic' }}>silence,</em> we
        build{' '}
        <em style={{ color: '#6F6F6F', fontStyle: 'italic' }}>the eternal.</em>
      </h1>

      <p
        className="animate-fade-rise-delay mt-8 max-w-2xl text-base leading-relaxed text-[#6F6F6F] sm:text-lg"
        style={{
          fontFamily: "'Inter', sans-serif",
          color: '#6F6F6F',
        }}
      >
        Building platforms for brilliant minds, fearless makers, and thoughtful
        souls. Through the noise, we craft digital havens for deep work and
        pure flows.
      </p>

      <a
        href="#studio"
        className="animate-fade-rise-delay-2 mt-12 inline-block rounded-full px-14 py-5 text-base text-white transition-transform duration-200 hover:scale-[1.03]"
        style={{
          backgroundColor: '#000000',
          fontFamily: "'Inter', sans-serif",
          color: '#FFFFFF',
        }}
      >
        Begin Journey
      </a>
    </section>
  );
}
