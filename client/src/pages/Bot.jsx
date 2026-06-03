import { useEffect, useState } from "react";

const CHECK = (
  <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
    <circle cx="10" cy="10" r="9" stroke="#EC6227" strokeWidth="1.5"/>
    <path d="M6 10l3 3 5-5" stroke="#EC6227" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const STEPS = [
  {
    n: "01",
    title: "Abra o bot no Telegram",
    desc: "Acesse o @tdolinks_bot diretamente pelo Telegram. Você pode pesquisar pelo nome ou usar o botão abaixo.",
    cta: { label: "Abrir @tdolinks_bot", href: "https://t.me/tdolinks_bot" },
    note: "O bot funciona em qualquer versão do Telegram — celular ou desktop.",
  },
  {
    n: "02",
    title: 'Envie "/start"',
    desc: 'Quando o bot abrir, toque em "Iniciar" ou digite /start. O bot vai te cumprimentar e pedir para você configurar suas preferências.',
    note: 'Se já usou antes, use /editar para atualizar o que você quer receber.',
  },
  {
    n: "03",
    title: "Diga o que você quer receber",
    desc: 'Responda em texto livre. Pode ser simples ou específico. O bot usa IA para entender e salvar suas preferências automaticamente.',
    examples: [
      '"teclados mecânicos e mouses gamer"',
      '"monitores até R$2.000"',
      '"fones Sony ou JBL com pelo menos 25% off"',
      '"qualquer coisa de tech em promoção"',
    ],
  },
  {
    n: "04",
    title: "Receba só o que importa",
    desc: "Pronto. Sempre que um deal novo aparecer e combinar com o que você pediu, o bot te avisa no privado — antes de todo mundo.",
    note: "Use /status para ver suas preferências. Use /parar para pausar a qualquer momento.",
  },
];

export default function Bot() {
  const [done, setDone] = useState({});

  useEffect(() => {
    document.body.style.background = "#0a0c10";
    document.documentElement.style.background = "#0a0c10";
    return () => {
      document.body.style.background = "";
      document.documentElement.style.background = "";
    };
  }, []);

  return (
    <div style={{
      minHeight: "100svh", background: "#0a0c10", color: "#fff",
      fontFamily: "'Satoshi','Inter',ui-sans-serif,sans-serif",
      WebkitFontSmoothing: "antialiased",
    }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .bot-step { transition: opacity 0.2s; }
        .bot-step:hover { opacity: 0.95; }
        code { background: rgba(236,98,39,0.12); color: #EC6227; padding: 2px 7px; border-radius: 5px; font-size: 0.9em; font-family: monospace; }
      `}</style>

      {/* Header */}
      <header style={{
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        maxWidth: 680, margin: "0 auto", width: "100%",
      }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <img src="/tdo-logo.png" alt="TDO Links" width={32} height={32} style={{ borderRadius: 9999 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "#fff", letterSpacing: "-0.01em" }}>TDO Links</span>
        </a>
        <span style={{
          fontSize: 11, fontWeight: 600, color: "#EC6227",
          background: "rgba(236,98,39,0.1)", border: "1px solid rgba(236,98,39,0.2)",
          borderRadius: 9999, padding: "4px 12px", letterSpacing: "0.05em", textTransform: "uppercase"
        }}>Premium</span>
      </header>

      {/* Hero banner */}
      <div style={{
        maxWidth: 680, margin: "0 auto", padding: "0 24px",
      }}>
        <div style={{
          marginTop: 24, borderRadius: 16, overflow: "hidden",
          position: "relative", aspectRatio: "2.5/1",
        }}>
          <img src="/bot-card.jpg" alt="TDO Premium" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to bottom, rgba(10,12,16,0) 30%, rgba(10,12,16,0.8) 100%)"
          }} />
        </div>
      </div>

      {/* Intro */}
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 24px 0" }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#EC6227", textTransform: "uppercase", marginBottom: 10 }}>
          Guia de ativação · TDO Premium
        </p>
        <h1 style={{ fontSize: "clamp(1.5rem, 5vw, 2rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.15 }}>
          Configure seus alertas<br />em 4 passos
        </h1>
        <p style={{ marginTop: 12, fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.65, maxWidth: 480 }}>
          O bot monitora os deals do canal e te avisa no privado só quando aparecer algo que combine com o que você pediu.
        </p>

        {/* Benefits pills */}
        <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {["Grátis", "Sem spam", "Cancele quando quiser", "Funciona no celular e desktop"].map(b => (
            <span key={b} style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 11.5, color: "rgba(255,255,255,0.6)",
              background: "rgba(255,255,255,0.05)", borderRadius: 9999, padding: "5px 12px",
            }}>
              {CHECK}{b}
            </span>
          ))}
        </div>
      </div>

      {/* Steps */}
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "36px 24px 80px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {STEPS.map((step, i) => (
            <div
              key={step.n}
              className="bot-step"
              style={{
                borderRadius: 14,
                padding: "22px 20px",
                background: done[i] ? "rgba(236,98,39,0.05)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${done[i] ? "rgba(236,98,39,0.2)" : "rgba(255,255,255,0.07)"}`,
                cursor: "pointer",
                transition: "background 0.2s, border-color 0.2s",
                marginBottom: 8,
              }}
              onClick={() => setDone(d => ({ ...d, [i]: !d[i] }))}
            >
              {/* Step header */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: done[i] ? "rgba(236,98,39,0.15)" : "rgba(255,255,255,0.06)",
                  border: `1px solid ${done[i] ? "rgba(236,98,39,0.3)" : "rgba(255,255,255,0.1)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, color: done[i] ? "#EC6227" : "rgba(255,255,255,0.4)",
                  letterSpacing: "0.03em",
                }}>{step.n}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", color: done[i] ? "#fff" : "rgba(255,255,255,0.9)" }}>
                    {step.title}
                  </p>
                  <p style={{ marginTop: 6, fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
                    {step.desc}
                  </p>
                  {step.examples && (
                    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                      {step.examples.map(ex => (
                        <div key={ex} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <span style={{ color: "#EC6227", fontSize: 12, marginTop: 1, flexShrink: 0 }}>→</span>
                          <code style={{ fontSize: 12 }}>{ex}</code>
                        </div>
                      ))}
                    </div>
                  )}
                  {step.note && (
                    <p style={{ marginTop: 10, fontSize: 11.5, color: "rgba(255,255,255,0.3)", lineHeight: 1.5, fontStyle: "italic" }}>
                      💡 {step.note}
                    </p>
                  )}
                  {step.cta && (
                    <a
                      href={step.cta.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{
                        marginTop: 14, display: "inline-flex", alignItems: "center", gap: 7,
                        background: "#EC6227", borderRadius: 9999, padding: "8px 16px",
                        textDecoration: "none",
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="white" width="14" height="14">
                        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                      </svg>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{step.cta.label}</span>
                    </a>
                  )}
                </div>
                {/* Done checkmark */}
                <div style={{
                  width: 20, height: 20, borderRadius: 9999, flexShrink: 0,
                  border: `1.5px solid ${done[i] ? "#EC6227" : "rgba(255,255,255,0.15)"}`,
                  background: done[i] ? "rgba(236,98,39,0.15)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s",
                }}>
                  {done[i] && <svg viewBox="0 0 12 12" fill="none" width="10" height="10">
                    <path d="M2 6l3 3 5-5" stroke="#EC6227" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Final CTA */}
        <div style={{
          marginTop: 8, padding: "24px 20px",
          borderRadius: 14, border: "1px solid rgba(236,98,39,0.15)",
          background: "rgba(236,98,39,0.05)",
          textAlign: "center",
        }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.8)", marginBottom: 16 }}>
            Pronto para ativar?
          </p>
          <a
            href="https://t.me/tdolinks_bot"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              background: "#EC6227", borderRadius: 12, padding: "14px 28px",
              textDecoration: "none",
            }}
          >
            <svg viewBox="0 0 24 24" fill="white" width="18" height="18">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>
              Começar agora — @tdolinks_bot
            </span>
          </a>
          <p style={{ marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
            Grátis · Sem cadastro · Cancele com /parar
          </p>
        </div>

        <div style={{ marginTop: 32, textAlign: "center" }}>
          <a href="/" style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", textDecoration: "none" }}>
            ← Voltar para TDO Links
          </a>
        </div>
      </div>
    </div>
  );
}
