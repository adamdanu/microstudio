export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <span
      style={{
        fontSize: `${size}px`,
        fontWeight: 700,
        letterSpacing: "-0.02em",
        color: "var(--text)",
        whiteSpace: "nowrap",
        lineHeight: 1,
      }}
    >
      MicroStudio
    </span>
  )
}