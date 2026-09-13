"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "./motion-preferences";

/**
 * The primitive every marketing scene is built from (docs/design-system.md):
 * fade + blur + a small translateY on scroll-into-view, 700-900ms
 * ease-out, never a slide or bounce. Respects `prefers-reduced-motion`
 * via Framer Motion's own hook (drops the translate/blur, keeps the fade).
 */
export function CinematicSection({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = usePrefersReducedMotion();

  return (
    <motion.section
      className={cn("cinematic", className)}
      initial={{ opacity: 0, y: reduceMotion ? 0 : 24, filter: reduceMotion ? "none" : "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay }}
    >
      {children}
    </motion.section>
  );
}
