/**
 * Marca do app: quadrado na cor `--brand` com "DTC", do DTC Master — a mesma
 * em todas as telas, com ou sem projeto selecionado.
 *
 * A cor pertence ao projeto, não ao app: é o que diz ao vendedor, de
 * relance, em qual produto ele está lançando a venda.
 */
export function Logo({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {

  return (
    <svg
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={className}
      style={{ flexShrink: 0 }}
      role="img"
      aria-label="DTC Master"
    >
      <rect width="40" height="40" rx="9" fill="var(--brand)" />
      <text
        x="20"
        y="21"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-geist-mono), ui-monospace, monospace"
        fontWeight="700"
        fontSize={13.5}
        letterSpacing="0.5"
        fill="var(--accent-foreground)"
      >
        DTC
      </text>
      {/* Linha de base: o traço que a marca carrega em todos os projetos. */}
      <path
        d="M 10 31.5 H 30"
        stroke="var(--accent-foreground)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}
