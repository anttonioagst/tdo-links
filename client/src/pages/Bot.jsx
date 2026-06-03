import { useEffect, useState } from "react";

const STEPS = [
  {
    n: "01",
    title: "Abra o bot no Telegram",
    desc: "Acesse o @tdolinks_bot pelo Telegram. Pesquise pelo nome ou use o botão abaixo.",
    cta: { label: "Abrir @tdolinks_bot", href: "https://t.me/tdolinks_bot" },
    note: "Funciona no celular e no desktop.",
  },
  {
    n: "02",
    title: 'Envie "/start"',
    desc: 'Toque em "Iniciar" ou digite /start. O bot vai te cumprimentar e pedir para configurar suas preferências.',
    note: 'Já usou antes? Use /editar para atualizar.',
  },
  {
    n: "03",
    title: "Diga o que você quer receber",
    desc: "Responda em texto livre — o bot usa IA para entender e salvar automaticamente.",
    examples: [
      '"teclados mecânicos e mouses gamer"',
      '"monitores até R$2.000"',
      '"fones Sony ou JBL com pelo menos 25% off"',
      '"qualquer tech em promoção"',
    ],
  },
  {
    n: "04",
    title: "Receba só o que importa",
    desc: "Sempre que um deal combinar com o que você pediu, o bot te avisa no privado — antes de todo mundo.",
    note: "Use /status para ver suas preferências. Use /parar para pausar.",
  },
];

export default function Bot() {
  const [done, setDone] = useState({});

  useEffect(() => {
    document.body.style.background = "#ffffff";
    document.documentElement.style.background = "#ffffff";
    return () => {
      document.body.style.background = "";
      document.documentElement.style.background = "";
    };
  }, []);

  return (
    <div style={{
      minHeight: "100svh", background: "#ffffff", color: "#1a1a1a",
      fontFamily: "'Satoshi','Inter',ui-sans-serif,sans-serif",
      WebkitFontSmoothing: "antialiased",
    }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        code { background: #fff3ee; color: #EC6227; padding: 2px 8px; border-radius: 5px; font-size: 0.88em; font-family: monospace; border: 1px solid rgba(236,98,39,0.15); }
      `}</style>

      {/* Header */}
      <header style={{
        borderBottom: "1px solid #f0f0f0",
        padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        maxWidth: 640, margin: "0 auto", width: "100%",
      }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <img src="/tdo-logo.png" alt="TDO Links" width={32} height={32} style={{ borderRadius: 9999 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", letterSpacing: "-0.01em" }}>TDO Links</span>
        </a>
        <span style={{
          fontSize: 11, fontWeight: 700, color: "#EC6227",
          background: "#fff3ee", border: "1px solid rgba(236,98,39,0.2)",
          borderRadius: 9999, padding: "4px 12px", letterSpacing: "0.06em", textTransform: "uppercase"
        }}>Premium</span>
      </header>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* Intro */}
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#EC6227", textTransform: "uppercase", marginBottom: 10 }}>
          Guia de ativação
        </p>
        <h1 style={{ fontSize: "clamp(1.6rem, 5.5vw, 2.2rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.12, color: "#1a1a1a" }}>
          Receba deals do seu<br />interesse no privado.
        </h1>
        <p style={{ marginTop: 12, fontSize: 14, color: "#6b7280", lineHeight: 1.65, maxWidth: 440 }}>
          O bot monitora o canal e te avisa só quando aparecer algo que combina com o que você pediu. Configure em 4 passos.
        </p>

        {/* Benefits row */}
        <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {["Grátis", "Sem spam", "Cancele com /parar"].map(b => (
            <span key={b} style={{
              fontSize: 11.5, color: "#6b7280",
              background: "#f5f5f5", borderRadius: 9999, padding: "4px 12px",
            }}>{b}</span>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "#f0f0f0", margin: "28px 0" }} />

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {STEPS.map((step, i) => (
            <div
              key={step.n}
              onClick={() => setDone(d => ({ ...d, [i]: !d[i] }))}
              style={{
                borderRadius: 14, padding: "20px 18px",
                background: done[i] ? "#fff8f5" : "#fafafa",
                border: `1px solid ${done[i] ? "rgba(236,98,39,0.25)" : "#ebebeb"}`,
                cursor: "pointer", transition: "all 0.18s",
              }}
            >
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                {/* Number */}
                <div style={{
                  width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                  background: done[i] ? "rgba(236,98,39,0.1)" : "#f0f0f0",
                  border: `1px solid ${done[i] ? "rgba(236,98,39,0.25)" : "#e5e5e5"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700,
                  color: done[i] ? "#EC6227" : "#999",
                  letterSpacing: "0.03em",
                }}>{step.n}</div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", color: "#1a1a1a" }}>
                    {step.title}
                  </p>
                  <p style={{ marginTop: 5, fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>
                    {step.desc}
                  </p>
                  {step.examples && (
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
                      {step.examples.map(ex => (
                        <div key={ex} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <span style={{ color: "#EC6227", fontSize: 11, marginTop: 2, flexShrink: 0 }}>→</span>
                          <code>{ex}</code>
                        </div>
                      ))}
                    </div>
                  )}
                  {step.note && (
                    <p style={{ marginTop: 8, fontSize: 11.5, color: "#aaa", lineHeight: 1.5 }}>
                      💡 {step.note}
                    </p>
                  )}
                  {step.cta && (
                    <a
                      href={step.cta.href}
                      target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{
                        marginTop: 12, display: "inline-flex", alignItems: "center", gap: 7,
                        background: "#EC6227", borderRadius: 9999, padding: "8px 16px",
                        textDecoration: "none",
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="white" width="13" height="13">
                        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                      </svg>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "#fff" }}>{step.cta.label}</span>
                    </a>
                  )}
                </div>

                {/* Checkbox */}
                <div style={{
                  width: 20, height: 20, borderRadius: 9999, flexShrink: 0, marginTop: 2,
                  border: `1.5px solid ${done[i] ? "#EC6227" : "#ddd"}`,
                  background: done[i] ? "#fff3ee" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.18s",
                }}>
                  {done[i] && <svg viewBox="0 0 12 12" fill="none" width="9" height="9">
                    <path d="M2 6l3 3 5-5" stroke="#EC6227" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Final CTA */}
        <div style={{
          marginTop: 24, padding: "24px 20px",
          borderRadius: 14, border: "1px solid #ebebeb",
          background: "#fafafa", textAlign: "center",
        }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 16 }}>
            Pronto para ativar?
          </p>
          <a
            href="https://t.me/tdolinks_bot"
            target="_blank" rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              background: "#EC6227", borderRadius: 12, padding: "14px 28px",
              textDecoration: "none",
            }}
          >
            <svg viewBox="0 0 24 24" fill="white" width="17" height="17">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>
              Começar — @tdolinks_bot
            </span>
          </a>
          <p style={{ marginTop: 12, fontSize: 11, color: "#bbb" }}>
            Grátis · Sem cadastro · Cancele com /parar
          </p>
        </div>

        <div style={{ marginTop: 28, textAlign: "center" }}>
          <a href="/" style={{ fontSize: 12, color: "#ccc", textDecoration: "none" }}>← Voltar</a>
        </div>
      </div>
    </div>
  );
}
