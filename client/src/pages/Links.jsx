import { useEffect, useState } from "react";

const ARROW = (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 7h10v10"/><path d="M7 17 17 7"/>
  </svg>
);

const ICONS = {
  instagram: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2.163c3.204 0 3.584.012 4.849.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.849.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zm0 10.162a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
    </svg>
  ),
  telegram: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  ),
  discord: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.034.054a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.749l7.73-8.835L1.254 2.25H8.08l4.261 5.628L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  ),
};

function BannerCard({ href, bgClass, icon, label, primary }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href={href || "#"}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        position: "relative",
        display: "block",
        borderRadius: 16,
        overflow: "hidden",
        textDecoration: "none",
        aspectRatio: "2.04 / 1",
        boxShadow: primary
          ? "rgba(236,98,39,0.12) 0 12px 34px 0"
          : "rgba(20,24,31,0.04) 0 10px 28px 0",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* gradient background */}
      <div style={{ position: "absolute", inset: 0, background: bgClass }} />
      {/* icon watermark */}
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%, -60%)", opacity: 0.12, color: "#fff",
        width: 80, height: 80,
      }}>
        {icon}
      </div>
      {/* bottom fade */}
      <div style={{
        position: "absolute", insetInline: 0, bottom: 0, height: "45%",
        background: "linear-gradient(transparent, rgba(0,0,0,0.28))",
        pointerEvents: "none",
      }} />
      {/* footer — label flex:1 pushes arrow to far right always */}
      <div style={{
        position: "absolute", insetInline: 0, bottom: 0, zIndex: 10,
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        gap: 12, padding: 16,
      }}>
        <p style={{
          fontSize: 11.5, fontWeight: 500, color: "rgba(255,255,255,0.95)",
          textShadow: "0 1px 4px rgba(0,0,0,0.18)", flex: 1, lineHeight: 1.35,
          minWidth: 0,
        }}>{label}</p>
        <span style={{
          width: 36, height: 36, borderRadius: 9999,
          background: "rgba(255,255,255,0.14)",
          border: "1px solid rgba(255,255,255,0.32)",
          backdropFilter: "blur(10px)",
          color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          transition: "transform 0.5s",
          transform: hovered ? "rotate(45deg)" : "rotate(0deg)",
        }}>
          {ARROW}
        </span>
      </div>
    </a>
  );
}

function TickerItem({ text, delay }) {
  return (
    <div style={{
      position: "absolute", insetInline: 0, top: 0,
      display: "flex", alignItems: "center", gap: 6,
      fontSize: 10, fontWeight: 500, color: "#6a707c",
      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      animation: `tick 9s linear infinite`,
      animationDelay: delay,
    }}>
      <span style={{ width: 4, height: 4, borderRadius: 9999, background: "#EC6227", flexShrink: 0 }} />
      <span>{text}</span>
    </div>
  );
}

function MiniCard({ href, title, desc, span = 3 }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href={href || "#"}
      target={href && href !== "#" ? "_blank" : undefined}
      rel="noopener noreferrer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        gridColumn: `span ${span}`,
        minHeight: 96,
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        gap: 6, padding: "14px 14px 12px",
        borderRadius: 16, textDecoration: "none", color: "#1e2229",
        background: "rgba(232,235,238,0.7)",
        boxShadow: hovered
          ? "rgba(255,255,255,0.9) 0 1px 0 0 inset, rgba(65,73,88,0.04) 0 -1px 0 0 inset, rgba(65,73,88,0.06) 0 8px 22px 0, 0 0 0 1px rgba(236,98,39,0.1)"
          : "rgba(255,255,255,0.9) 0 1px 0 0 inset, rgba(65,73,88,0.04) 0 -1px 0 0 inset, rgba(65,73,88,0.06) 0 8px 22px 0",
        transition: "box-shadow 0.2s",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <p style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.005em", lineHeight: 1.3, flex: 1 }}>{title}</p>
        <span style={{
          color: "#6a707c", opacity: hovered ? 0.9 : 0.45, flexShrink: 0,
          transition: "opacity 0.2s, transform 0.25s",
          transform: hovered ? "translate(2px,-2px)" : "translate(0,0)",
        }}>
          {ARROW}
        </span>
      </div>
      {desc && <p style={{ fontSize: 10.5, color: "#6a707c", lineHeight: 1.35 }}>{desc}</p>}
    </a>
  );
}

function SocialLink({ href, icon, label, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href={href || "#"}
      target={href && href !== "#" ? "_blank" : undefined}
      rel="noopener noreferrer"
      aria-label={label}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        padding: 8, opacity: hovered ? 1 : 0.8, color: "#1e2229",
        textDecoration: "none", borderRadius: 9999,
        transition: "opacity 0.2s, transform 0.2s",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        flexShrink: 0,
      }}
    >
      {icon}
    </a>
  );
}

export default function Links() {
  const [cfg, setCfg] = useState({
    telegramUrl: "https://t.me/tdolinks",
    discordUrl: "", xUrl: "", instagramUrl: "", facebookUrl: "", metaPixelId: "",
  });

  // Force white background — overrides admin dashboard's global bg-zinc-950
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = "#ffffff";
    document.documentElement.style.background = "#ffffff";
    return () => {
      document.body.style.background = prev;
      document.documentElement.style.background = "";
    };
  }, []);

  useEffect(() => {
    const base = import.meta.env.VITE_API_URL || "";
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000); // 4s timeout — never block the page
    fetch(`${base}/api/links-config`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => setCfg(prev => ({ ...prev, ...d })))
      .catch(() => {})
      .finally(() => clearTimeout(t));
    return () => { ctrl.abort(); clearTimeout(t); };
  }, []);

  // Meta Pixel
  useEffect(() => {
    if (!cfg.metaPixelId) return;
    if (window.fbq) { window.fbq("track", "ViewContent"); return; }
    const script = document.createElement("script");
    script.innerHTML = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${cfg.metaPixelId}');fbq('track','ViewContent');`;
    document.head.appendChild(script);
  }, [cfg.metaPixelId]);

  const trackLead = () => { if (window.fbq) window.fbq("track", "Lead"); };

  const socialLinks = [
    { key: "instagram", href: cfg.instagramUrl, label: "Instagram" },
    { key: "telegram",  href: cfg.telegramUrl,  label: "Telegram",  onClick: trackLead },
    { key: "discord",   href: cfg.discordUrl,   label: "Discord" },
    { key: "x",         href: cfg.xUrl,         label: "X (Twitter)" },
    { key: "facebook",  href: cfg.facebookUrl,  label: "Facebook" },
  ];

  return (
    <>
      <style>{`
        @keyframes tick {
          0%   { transform: translateY(100%); opacity: 0; }
          8%   { transform: translateY(0);    opacity: 1; }
          28%  { transform: translateY(0);    opacity: 1; }
          36%  { transform: translateY(-100%); opacity: 0; }
          100% { transform: translateY(-100%); opacity: 0; }
        }
        .links-page * { box-sizing: border-box; margin: 0; padding: 0; }
        .links-page {
          background: #fff;
          color: #1e2229;
          font-family: 'Satoshi','Inter',ui-sans-serif,sans-serif;
          -webkit-font-smoothing: antialiased;
          min-height: 100svh;
        }
        /* Mobile: static gradient, no blur — prevents phone heating and slow load */
        @media (max-width: 768px) {
          .links-bg { background: radial-gradient(ellipse 80% 50% at 0% 20%, hsl(28 60% 92% / 0.7) 0%, transparent 60%),
                                  radial-gradient(ellipse 70% 50% at 100% 80%, hsl(210 20% 94% / 0.7) 0%, transparent 60%); }
          .links-orb { display: none !important; }
        }
        /* Desktop: animated orbs with blur */
        @media (min-width: 769px) {
          @keyframes da { to { transform: translate(24px,16px) scale(1.05); } }
          @keyframes db { to { transform: translate(-18px,22px) scale(0.97); } }
          @keyframes dc { to { transform: translate(12px,-20px) scale(1.03); } }
          .links-orb-a { width:360px;height:360px;left:-96px;top:40px;background:hsl(28 60% 88%/0.6);filter:blur(110px);animation:da 12s ease-in-out infinite alternate; }
          .links-orb-b { width:300px;height:300px;right:-60px;top:42%;background:hsl(210 18% 91%/0.75);filter:blur(120px);animation:db 16s ease-in-out infinite alternate; }
          .links-orb-c { width:380px;height:380px;left:18%;bottom:-120px;background:hsl(32 28% 90%/0.55);filter:blur(130px);animation:dc 14s ease-in-out infinite alternate; }
        }
      `}</style>

      <div className="links-page">
        {/* Background — static gradient on mobile, animated orbs on desktop */}
        <div className="links-bg" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
          <div className="links-orb links-orb-a" style={{ position: "absolute", borderRadius: 9999 }} />
          <div className="links-orb links-orb-b" style={{ position: "absolute", borderRadius: 9999 }} />
          <div className="links-orb links-orb-c" style={{ position: "absolute", borderRadius: 9999 }} />
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", color: "#1e2229", opacity: 0.035 }} xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="links-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M40 0H0V40" fill="none" stroke="currentColor" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#links-grid)" />
          </svg>
        </div>

        {/* Main */}
        <main style={{ position: "relative", zIndex: 10, margin: "0 auto", width: "100%", maxWidth: 540, padding: "20px 20px 96px" }}>

          {/* Header — horizontal, centered on page */}
          <section style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 16, padding: 10, width: "fit-content", margin: "0 auto" }}>
            {/* Logo mark */}
            <div style={{
              width: 40, height: 40, borderRadius: 9999,
              background: "#EC6227",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
                <ellipse cx="12" cy="12" rx="10" ry="6.5" stroke="white" strokeWidth="1.5" />
                <circle cx="12" cy="12" r="2.5" fill="white" />
              </svg>
            </div>

            {/* Vertical divider */}
            <div style={{
              width: 1, height: 40, flexShrink: 0,
              background: "linear-gradient(180deg, transparent, rgba(236,98,39,0.5), rgba(236,98,39,0.25), transparent)",
            }} />

            {/* Name + ticker */}
            <div style={{ minWidth: 0 }}>
              <h1 style={{
                fontWeight: 600,
                fontSize: "clamp(1rem, 4.1vw, 1.35rem)",
                letterSpacing: "-0.025em",
                lineHeight: 1.1,
                color: "#1e2229",
              }}>
                TDO <span style={{ color: "#EC6227" }}>LINKS</span>
              </h1>
              <div style={{ position: "relative", height: 14, overflow: "hidden", marginTop: 3 }}>
                <TickerItem text="Curadoria real de tech premium" delay="0s" />
                <TickerItem text="Descontos verificados · Marcas consolidadas" delay="-6s" />
                <TickerItem text="Só o que realmente vale comprar" delay="-3s" />
              </div>
            </div>
          </section>

          {/* Social icons */}
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "nowrap", gap: 0 }}>
            {socialLinks.map(({ key, href, label, onClick }) => (
              <SocialLink key={key} href={href} icon={ICONS[key]} label={label} onClick={onClick} />
            ))}
          </div>

          {/* 2 Banner cards */}
          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <BannerCard
              href={cfg.telegramUrl}
              bgClass="linear-gradient(135deg, #1a1f2e 0%, #EC6227 100%)"
              icon={ICONS.telegram}
              label="Canal do Telegram · Deals em tempo real"
              primary
            />
            <BannerCard
              href={cfg.discordUrl}
              bgClass="linear-gradient(135deg, #1a1f2e 0%, #5865f2 100%)"
              icon={ICONS.discord}
              label="Comunidade no Discord · Discussão e novidades"
              primary={false}
            />
          </div>

          {/* Mini cards bento grid */}
          <div style={{
            marginTop: 12,
            display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12,
          }}>
            <MiniCard href={cfg.telegramUrl} title="Ofertas" desc="Últimas ofertas publicadas no canal" span={3} />
            <MiniCard href="#" title="Amazon BR" desc="Deals direto da Amazon Brasil" span={3} />
            <MiniCard href={cfg.telegramUrl} title="Telegram" desc="Entrar no canal de deals" span={4} />
            <MiniCard href={cfg.xUrl} title="X" desc="Seguir no Twitter" span={2} />
            <MiniCard href={cfg.discordUrl} title="Discord" desc="Comunidade de entusiastas de tech" span={3} />
            <MiniCard href={cfg.instagramUrl} title="Instagram" desc="Conteúdo e novidades" span={3} />

            {/* Full-width dark pill CTA */}
            <div style={{ gridColumn: "span 6", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 4 }}>
              <a
                href={cfg.telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "12px 24px", borderRadius: 9999,
                  background: "#1f2229", border: "1px solid rgba(255,255,255,0.05)",
                  textDecoration: "none", transition: "opacity 0.2s, transform 0.2s",
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = "0.88"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                {ICONS.telegram}
                <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.005em", color: "rgba(255,255,255,0.92)" }}>
                  Ver todos os deals no canal
                </span>
              </a>
            </div>
          </div>

          <footer style={{ marginTop: 40, textAlign: "center", fontSize: 10, color: "rgba(30,34,41,0.38)" }}>
            © TDO Links {new Date().getFullYear()} · Tô de Olho em tech pra você
          </footer>
        </main>
      </div>
    </>
  );
}
