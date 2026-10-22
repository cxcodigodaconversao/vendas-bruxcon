/**
 * Marca do app. Quadrado na cor `--brand` com a sigla do PROJETO selecionado
 * (DTC…) — sem projeto, mostra "BX", da Bruxcon.
 *
 * A cor pertence ao projeto, não ao app: é o que diz ao vendedor, de
 * relance, em qual produto ele está lançando a venda.
 */
export function Logo({
  size = 32,
  sigla,
  className,
}: {
  size?: number;
  /** Sigla do projeto selecionado. Ausente = marca do grupo. */
  sigla?: string;
  className?: string;
}) {
  const texto = (sigla || "BX").toUpperCase().slice(0, 4);
  // Quatro letras precisam caber no mesmo quadrado que três.
  const fonte = texto.length >= 4 ? 11 : texto.length === 3 ? 13.5 : 16;

  return (
    <svg
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={className}
      style={{ flexShrink: 0 }}
      role="img"
      aria-label={sigla ? `Projeto ${texto}` : "Bruxcon"}
    >
      <rect width="40" height="40" rx="9" fill="var(--brand)" />
      <text
        x="20"
        y="21"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-geist-mono), ui-monospace, monospace"
        fontWeight="700"
        fontSize={fonte}
        letterSpacing="0.5"
        fill="var(--accent-foreground)"
      >
        {texto}
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
