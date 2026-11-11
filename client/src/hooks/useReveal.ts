import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

export function useReveal<T extends HTMLElement>(dependencies: ReadonlyArray<unknown> = []) {
  const scope = useRef<T>(null);

  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('[data-reveal]', {
          opacity: 0,
          y: 16,
          duration: 0.5,
          ease: 'power2.out',
          stagger: 0.06,
          clearProps: 'all',
        });
      });
      return () => media.revert();
    },
    { scope, dependencies: [...dependencies], revertOnUpdate: true }
  );

  return scope;
}
