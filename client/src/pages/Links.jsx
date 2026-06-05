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

function BannerCard({ href, bgClass, bgImage, icon, label, primary, internal, onClick }) {
  const [hovered, setHovered] = useState(false);
  const linkProps = internal
    ? { href: href || "#" }
    : { href: href || "#", target: "_blank", rel: "noopener noreferrer" };
  return (
    <a
      {...linkProps}
      onClick={onClick}
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
      {/* background — image or gradient */}
      {bgImage
        ? <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${bgImage})`, backgroundSize: "cover", backgroundPosition: "center", transition: "transform 0.6s", transform: hovered ? "scale(1.03)" : "scale(1)" }} />
        : <div style={{ position: "absolute", inset: 0, background: bgClass }} />
      }
      {/* icon watermark — only when no image */}
      {!bgImage && <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%, -60%)", opacity: 0.12, color: "#fff",
        width: 80, height: 80,
      }}>
        {icon}
      </div>}
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
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</span>
    </div>
  );
}

// Logos das marcas — SVG com viewBox ajustado ao conteúdo real de cada path
const BRAND_LOGOS = {
  // Apple icon — ocupa todo o 24x24
  apple: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32" aria-hidden="true">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  ),
  // Logitech — sem path no simple-icons, wordmark limpo
  logitech: (
    <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>Logitech</span>
  ),
  // Samsung — path ocupa y:10–14 num viewBox 24×24; recortamos para essa faixa
  samsung: (
    <svg viewBox="0 9.8 24 4.6" fill="currentColor" width="110" height="22" aria-hidden="true">
      <path d="M19.8166 10.2808l.0459 2.6934h-.023l-.7793-2.6934h-1.2837v3.3925h.8481l-.0458-2.785h.023l.8366 2.785h1.2264v-3.3925zm-16.149 0l-.6418 3.427h.9284l.4699-3.1175h.0229l.4585 3.1174h.9169l-.6304-3.4269zm5.1805 0l-.424 2.6132h-.023l-.424-2.6132H6.5788l-.0688 3.427h.8596l.023-3.0832h.0114l.573 3.0831h.8711l.5731-3.083h.023l.0228 3.083h.8596l-.0802-3.4269zm-7.2664 2.4527c.0343.0802.0229.1949.0114.2522-.0229.1146-.1031.2292-.3324.2292-.2177 0-.3438-.126-.3438-.3095v-.3323H0v.2636c0 .7679.6074.9971 1.2493.9971.6189 0 1.1346-.2178 1.2149-.7794.0458-.298.0114-.4928 0-.5616-.1605-.722-1.467-.9283-1.5588-1.3295-.0114-.0688-.0114-.1375 0-.1834.023-.1146.1032-.2292.3095-.2292.2063 0 .321.126.321.3095v.2063h.8595v-.2407c0-.745-.6762-.8596-1.1576-.8596-.6074 0-1.1117.2063-1.2034.7564-.023.149-.0344.2866.0114.4585.1376.7106 1.364.9169 1.5358 1.3524m11.152 0c.0343.0803.0228.1834.0114.2522-.023.1146-.1032.2292-.3324.2292-.2178 0-.3438-.126-.3438-.3095v-.3323h-.917v.2636c0 .7564.596.9857 1.2379.9857.6189 0 1.1232-.2063 1.2034-.7794.0459-.298.0115-.4814 0-.5616-.1375-.7106-1.4327-.9284-1.5243-1.318-.0115-.0688-.0115-.1376 0-.1835.0229-.1146.1031-.2292.3094-.2292.1948 0 .321.126.321.3095v.2063h.848v-.2407c0-.745-.6647-.8596-1.146-.8596-.6075 0-1.1004.1948-1.192.7564-.023.149-.023.2866.0114.4585.1376.7106 1.341.9054 1.513 1.3524m2.8882.4585c.2407 0 .3094-.1605.3323-.2522.0115-.0343.0115-.0917.0115-.126v-2.533h.871v2.4642c0 .0688 0 .1948-.0114.2292-.0573.6419-.5616.8482-1.192.8482-.6303 0-1.1346-.2063-1.192-.8482 0-.0344-.0114-.1604-.0114-.2292v-2.4642h.871v2.533c0 .0458 0 .0916.0115.126 0 .0917.0688.2522.3095.2522m7.1518-.0344c.2522 0 .3324-.1605.3553-.2522.0115-.0343.0115-.0917.0115-.126v-.4929h-.3553v-.5043H24v.917c0 .0687 0 .1145-.0115.2292-.0573.6303-.596.8481-1.2034.8481-.6075 0-1.1461-.2178-1.2034-.8481-.0115-.1147-.0115-.1605-.0115-.2293v-1.444c0-.0574.0115-.172.0115-.2293.0802-.6419.596-.8482 1.2034-.8482s1.1347.2063 1.2034.8482c.0115.1031.0115.2292.0115.2292v.1146h-.8596v-.1948s0-.0803-.0115-.1261c-.0114-.0802-.0802-.2521-.3438-.2521-.2521 0-.321.1604-.3438.2521-.0115.0458-.0115.1032-.0115.1605v1.5702c0 .0458 0 .0916.0115.126 0 .0917.0917.2522.3323.2522" />
    </svg>
  ),
  // Sony — path ocupa y:9.5–14.5 num viewBox 24×24; recortamos
  sony: (
    <svg viewBox="0 9.5 24 5.5" fill="currentColor" width="96" height="22" aria-hidden="true">
      <path d="M8.5505 9.8881c.921 0 1.6574.2303 2.2209.7423.3848.3485.5999.8454.5939 1.3665a1.9081 1.9081 0 0 1-.5939 1.3726c-.5272.4848-1.3483.7423-2.221.7423-.8725 0-1.6785-.2575-2.2148-.7423-.3908-.3485-.609-.8484-.603-1.3726 0-.518.2182-1.015.603-1.3665.5-.4545 1.3847-.7423 2.2149-.7423zm.003 3.6692c.4606 0 .8878-.1606 1.1878-.4575.2999-.2999.4332-.6605.4332-1.1029 0-.4242-.1484-.821-.4333-1.1029-.2938-.2908-.7332-.4545-1.1877-.4545s-.8938.1637-1.1907.4545c-.2848.2818-.4333.6787-.4333 1.103-.006.409.1485.806.4333 1.1029.2969.2939.7332.4575 1.1907.4575zm-4.8418-1.9665c.1605.0424.315.094.4666.1636a1.352 1.352 0 0 1 .3787.2576c.197.206.309.4817.306.7665a.9643.9643 0 0 1-.3787.7788 2.0662 2.0662 0 0 1-.709.3485 3.7231 3.7231 0 0 1-1.1938.1697c-.352 0-.5467-.0406-.8138-.0962l-.077-.016c-.294-.0666-.5817-.1575-.8575-.2787a.0695.0695 0 0 0-.0424-.0121c-.0454 0-.0818.0394-.0818.0848v.203H.1212v-1.4786h.5242a.7559.7559 0 0 0 .1363.418c.2121.2607.4394.3607.6575.4395.3666.1212.7514.1848 1.1362.1969.5526 0 .8756-.134.9455-.163l.009-.0037.0062-.0023c.0616-.0226.3119-.1143.3119-.3916 0-.2743-.2338-.334-.387-.373l-.022-.0058c-.1708-.046-.562-.0872-.9897-.1323l-.1526-.016c-.4848-.0515-.9696-.1273-1.1968-.1758-.4977-.1097-.6942-.2917-.816-.4045l-.0082-.0076A1.0192 1.0192 0 0 1 0 11.1608c0-.497.3394-.797.7575-.9817.4454-.2.9756-.288 1.4392-.288.8211.0031 1.4877.2697 1.727.394.097.0515.1455-.0121.1455-.0606v-.1484h.5272v1.2876h-.4727a.9056.9056 0 0 0-.2939-.4909 1.289 1.289 0 0 0-.297-.1787c-.3968-.1667-.821-.2515-1.2513-.2455-.4423 0-.8665.085-1.0786.2153-.1333.0818-.2.1848-.2.306 0 .1727.1454.2424.2182.2636.1967.0597.6328.103.972.1369.0736.0073.1426.0142.2036.0206.3272.0334 1.012.1243 1.315.2zm18.1673-.9966v-.4787H24v.4696h-.4757c-.1727 0-.2424.0334-.3727.1788l-1.4271 1.63a.098.098 0 0 0-.0182.0698v.7423a1.106 1.106 0 0 0 .0121.103.1496.1496 0 0 0 .1.0909.9368.9368 0 0 0 .1303.009h.4848v.4698h-2.5724v-.4697h.4606a.9343.9343 0 0 0 .1302-.0091.1627.1627 0 0 0 .1031-.091.5626.5626 0 0 0 .009-.1v-.7422c0-.0242 0-.0242-.0333-.0636a606.7592 606.7592 0 0 0-1.4119-1.6028c-.0758-.0788-.2061-.2061-.406-.2061h-.4576v-.4696h2.5876v.4696h-.3121c-.0697 0-.1182.0697-.0576.1455 0 0 .8696 1.0392.8787 1.0513.0091.0122.0152.0122.0273.003.0121-.009.8938-1.0453.8999-1.0543a.0912.0912 0 0 0-.0182-.1273.1095.1095 0 0 0-.0606-.0182zm-6.284-.0031h.4848c.2212 0 .2606.0848.2636.2909l.0273 1.5664-2.5815-2.324H11.944v.4697h.412c.297 0 .3182.1636.3182.309v2.2138c.0004.1285.0009.295-.1818.295h-.506v.4667h2.1634v-.4697h-.5273c-.212 0-.2211-.097-.2242-.303v-1.8816l2.9724 2.6511h.7575l-.0394-2.9966c.003-.218.0182-.2908.2424-.2908h.4726v-.4697H15.595Z" />
    </svg>
  ),
  // HyperX — path ocupa de y:5 a y:18 no viewBox 24×24
  hyperx: (
    <svg viewBox="0 4.5 24 14" fill="currentColor" width="80" height="28" aria-hidden="true">
      <path d="M22.428 5.234c-.036-.005-.055.05-.055.05-.935 2.297-2.446 4.096-4.25 5.503-2.157-1.445-4.476-2.16-6.477-2.5l.508-1.695H10.56l-.445 1.496c-2.12-.194-3.61.004-3.664.008-.085.007-.108.027-.106.056.004.042.084.043.084.043 4.228.324 7.684 1.789 10.367 3.528C9.926 16.098.15 15.826.15 15.826c-.123-.002-.149.019-.15.065-.004.07.113.07.113.07 12.395 1.527 17.776-2.796 18.238-3.143 3.685 2.82 5.513 5.867 5.513 5.867.034.05.069.092.105.079.056-.02.02-.106.02-.106-1.062-3.053-2.666-5.243-4.475-6.808 2.846-2.757 2.926-6.242 2.945-6.499.01-.113-.01-.115-.03-.117zM4.939 6.592l-1.313 4.384h1.582l1.314-4.384Zm1.39 2.023-.222.748h3.625c-.09.297-.483 1.613-.483 1.613h1.594l.422-1.414a21.95 21.949 0 0 0-4.936-.947z" />
    </svg>
  ),
  // Razer — wordmark limpo
  razer: (
    <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: "0.1em", fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>RAZER</span>
  ),
};

// Card de lançamento — logo centralizada, sem texto extra
function LaunchCard({ brand = "logitech", span = 3 }) {
  const logo = BRAND_LOGOS[brand.toLowerCase()];
  return (
    <div style={{
      gridColumn: `span ${span}`,
      minHeight: 88,
      display: "flex", alignItems: "center", justifyContent: "center",
      borderRadius: 16,
      background: "rgba(232,235,238,0.7)",
      boxShadow: "rgba(255,255,255,0.9) 0 1px 0 0 inset, rgba(65,73,88,0.04) 0 -1px 0 0 inset, rgba(65,73,88,0.06) 0 8px 22px 0",
      cursor: "default",
    }}>
      <div style={{ opacity: 0.55, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {logo || <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#1e2229" }}>{brand}</span>}
      </div>
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
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up {
          opacity: 0;
          animation: fadeUp 0.52s cubic-bezier(0.22,1,0.36,1) forwards;
          animation-delay: var(--d, 0s);
        }
        .links-divider {
          display: none;
          height: 1px;
          background: rgba(30,34,41,0.07);
          border-radius: 1px;
        }
        .links-vdivider { display: none; }
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
        /* Desktop: animated orbs + dividers */
        @media (min-width: 769px) {
          .links-divider { display: block; }
          .links-vdivider { display: block; }
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
          <section className="fade-up" style={{ "--d": "0.05s", display: "flex", alignItems: "center", gap: 10, borderRadius: 16, padding: 10, width: "fit-content", margin: "0 auto" }}>
            {/* Logo mark */}
            <img
              src="/tdo-logo.png"
              alt="TDO Links"
              width={40}
              height={40}
              style={{ borderRadius: 9999, flexShrink: 0, display: "block" }}
            />

            {/* Vertical divider — desktop only */}
            <div className="links-vdivider" style={{ width: 1, height: 32, background: "rgba(30,34,41,0.12)", flexShrink: 0 }} />

            {/* Name + ticker */}
            <div style={{ minWidth: 0 }}>
              <h1 style={{
                fontWeight: 600,
                fontSize: "clamp(1rem, 4.1vw, 1.35rem)",
                letterSpacing: "-0.025em",
                lineHeight: 1.1,
                color: "#1e2229",
              }}>
                TDO LINKS
              </h1>
              <div style={{ position: "relative", height: 14, overflow: "hidden", marginTop: 3 }}>
                <TickerItem text="Curadoria real de tech premium" delay="0s" />
                <TickerItem text="Descontos verificados · Marcas consolidadas" delay="-6s" />
                <TickerItem text="Só o que realmente vale comprar" delay="-3s" />
              </div>
            </div>
          </section>

          <div className="links-divider fade-up" style={{ "--d": "0.15s", marginTop: 16 }} />

          {/* Social icons */}
          <div className="fade-up" style={{ "--d": "0.18s", marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "nowrap", gap: 0 }}>
            {socialLinks.map(({ key, href, label, onClick }) => (
              <SocialLink key={key} href={href} icon={ICONS[key]} label={label} onClick={onClick} />
            ))}
          </div>

          <div className="links-divider fade-up" style={{ "--d": "0.28s", marginTop: 16 }} />

          {/* Banner cards */}
          <div className="fade-up" style={{ "--d": "0.32s", marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Card 1 — Telegram */}
            <BannerCard
              href={cfg.telegramUrl}
              bgImage="/card01-site.png"
              icon={ICONS.telegram}
              label="Canal do Telegram · Deals em primeira mão"
              primary
              onClick={trackLead}
            />
            {/* Card 2 — Discord */}
            <BannerCard
              href={cfg.discordUrl}
              bgImage="/card02-site.png"
              icon={ICONS.discord}
              label="Comunidade no Discord · Discussão e novidades"
              primary={false}
            />
          </div>

          {/* Launch cards — label + grid de logos */}
          <p className="fade-up" style={{ "--d": "0.42s", marginTop: 20, fontSize: 11, fontWeight: 500, color: "#6a707c", letterSpacing: "0.01em" }}>
            Lançamentos:
          </p>
          <div className="fade-up" style={{
            "--d": "0.44s",
            marginTop: 8,
            display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10,
          }}>
            <LaunchCard brand="apple"   span={3} />
            <LaunchCard brand="logitech" span={3} />
            <LaunchCard brand="samsung" span={4} />
            <LaunchCard brand="sony"    span={2} />
            <LaunchCard brand="hyperx"  span={3} />
            <LaunchCard brand="razer"   span={3} />

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
                <span style={{ color: "rgba(255,255,255,0.9)", display: "flex" }}>{ICONS.telegram}</span>
                <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.005em", color: "rgba(255,255,255,0.92)" }}>
                  Ver todos os deals no canal
                </span>
              </a>
            </div>
          </div>

          <div className="links-divider fade-up" style={{ "--d": "0.56s", marginTop: 28 }} />

          <footer className="fade-up" style={{ "--d": "0.6s", marginTop: 20, textAlign: "center", fontSize: 10, color: "rgba(30,34,41,0.38)" }}>
            © TDO Links {new Date().getFullYear()} · Tô de Olho em tech pra você
          </footer>
        </main>
      </div>
    </>
  );
}
