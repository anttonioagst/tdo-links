import { useEffect } from "react";

const STEPS = [
  { n: "01", title: "Abra o bot", desc: "Toque no botão abaixo e inicie uma conversa com o @tdolinks_bot no Telegram." },
  { n: "02", title: "Diga o que quer", desc: 'Fale em texto livre. Ex: "teclados mecânicos e monitores até R$2.000".' },
  { n: "03", title: "Receba no privado", desc: "Sempre que aparecer um deal que combine com você, o bot te avisa direto no Telegram." },
];

export default function Bot() {
  useEffect(() => {
    document.body.style.background = "#0d0f14";
    document.documentElement.style.background = "#0d0f14";
    return () => {
      document.body.style.background = "";
      document.documentElement.style.background = "";
    };
  }, []);

  return (
    <div style={{
      minHeight: "100svh", background: "#0d0f14", color: "#fff",
      fontFamily: "'Satoshi','Inter',ui-sans-serif,sans-serif",
      WebkitFontSmoothing: "antialiased",
    }}>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>

      {/* Hero */}
      <div style={{ position: "relative", overflow: "hidden", minHeight: "52vh", display: "flex", alignItems: "flex-end" }}>
        {/* Background image */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "url(/bot-card.jpg)",
          backgroundSize: "cover", backgroundPosition: "center",
          filter: "brightness(0.55)",
        }} />
        {/* Gradient overlay */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom, rgba(13,15,20,0.2) 0%, rgba(13,15,20,0.95) 100%)",
        }} />
        {/* Content */}
        <div style={{ position: "relative", zIndex: 10, padding: "0 24px 40px", maxWidth: 600, margin: "0 auto", width: "100%" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#EC6227", textTransform: "uppercase", marginBottom: 12 }}>
            TDO Links · Exclusivo
          </p>
          <h1 style={{ fontSize: "clamp(1.75rem, 6vw, 2.5rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
            Seus deals,<br />do seu jeito.
          </h1>
          <p style={{ marginTop: 14, fontSize: 15, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, maxWidth: 420 }}>
            Diga ao bot o que você quer receber e ele cuida do resto — só o que importa, só quando vale.
          </p>
        </div>
      </div>

      {/* Steps */}
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "40px 24px" }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", marginBottom: 24 }}>
          Como funciona
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {STEPS.map(({ n, title, desc }, i) => (
            <div key={n} style={{
              display: "flex", gap: 20, padding: "20px 0",
              borderTop: i === 0 ? "1px solid rgba(255,255,255,0.07)" : "none",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#EC6227", letterSpacing: "0.05em", flexShrink: 0, paddingTop: 3 }}>{n}</span>
              <div>
                <p style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</p>
                <p style={{ marginTop: 4, fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.55 }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <a
          href="https://t.me/tdolinks_bot"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            marginTop: 32, display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            background: "#EC6227", borderRadius: 14, padding: "16px 24px",
            textDecoration: "none", transition: "opacity 0.2s",
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = "0.88"; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
        >
          <svg viewBox="0 0 24 24" fill="white" width="20" height="20">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
          </svg>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>
            Ativar alertas personalizados
          </span>
        </a>

        <p style={{ marginTop: 16, textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
          Grátis · Sem spam · Cancele quando quiser
        </p>

        {/* Back */}
        <div style={{ marginTop: 40, textAlign: "center" }}>
          <a href="/" style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textDecoration: "none" }}>
            ← Voltar
          </a>
        </div>
      </div>
    </div>
  );
}
