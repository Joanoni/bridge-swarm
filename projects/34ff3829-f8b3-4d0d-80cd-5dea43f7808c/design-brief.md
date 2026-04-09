# Design Brief — Juanita Fotografía
## Portfólio Web · Juanita González · Bogotá, Colombia

---

## 1. RESUMEN DEL PROYECTO

**Cliente:** Juanita González  
**Instagram:** [@juanita_g21](https://www.instagram.com/juanita_g21/)  
**Cuenta secundaria (ilustración):** [@nosoy_juana](https://www.instagram.com/nosoy_juana/)  
**Ubicación:** Bogotá, Colombia  
**Idioma del sitio:** Español colombiano  
**Objetivo:** Sitio web de portafolio profesional para mostrar su trabajo fotográfico (retratos, editorial, fotografía cinematográfica/moody) y conseguir clientes para sesiones.

---

## 2. ANÁLISIS DEL PERFIL — JUANITA GONZALEZ (@juanita_g21)

### Estilo Fotográfico
Based on her Instagram bio and hashtag usage, Juanita's style is:
- **Especialidad principal:** Retratos (portraits) en Bogotá
- **Estética:** Moody, cinematográfica, vintage, editorial — colores cálidos con tonos oscuros y profundos
- **Hashtags utilizados:** `#portrait_mood`, `#portrait`, `#photography`, `#shooting`, `#retrato`, `#vintagephotography`, `#cinematography`, `#editorial`, `#editorialphoto`, `#color`, `#bogota`
- **Formato:** Canon DSLR — mezcla de fotografía digital, con influencias analógicas (referencias a Kodak Portra)
- **Tono visual:** íntimo, artístico, con fuerte narrativa personal — sus fotos cuentan historias
- **Personalidad:** Creativa, auténtica, con doble faceta artística (fotografía + ilustración con @nosoy_juana)

### Público Objetivo
- Personas y marcas en Bogotá que buscan sesiones de retratos artísticos
- Marcas editoriales y de moda que necesitan fotografía cinematográfica
- Jóvenes creativos que valoran lo auténtico y lo visual

---

## 3. REFERENCIAS DE DISEÑO

### Inspiración Visual
- **Awwwards Photography:** Sites como Nordica Photography, Stefan Kaltenegger, Flavien Guilbaud — layouts full-screen con imágenes dominantes
- **Tendencia 2024-2025:** Paletas neutras elegantes con un color acento llamativo; transiciones suaves; tipografía serif elegante mezclada con sans-serif limpio
- **Estética general:** Minimalismo editorial — la foto manda, el diseño es el marco

### Sitios de Referencia Directa
1. **Nordica Photography** — hero full-screen, navegación minimal, grid elegante
2. **Stefan Kaltenegger** — dark moody, tipografía bold, layout inmersivo
3. **Flavien Guilbaud** — portafolio fotográfico con transiciones cinematográficas
4. **Minimalio photographer portfolios** — espacio en blanco, fotografías protagonistas

---

## 4. CONCEPTO VISUAL

### Concepto General
**"Luz que habla"** — Un sitio oscuro y elegante donde cada imagen de Juanita emerge como luz en la oscuridad. El diseño acompaña sin competir. Cinematográfico, íntimo, artístico.

### Estilo Visual
- **Mood:** Dark-elegant / Moody Editorial
- **Temperatura visual:** Cálido-oscuro (tonos ámbar, terracota, negro profundo)
- **Densidad:** Minimalista — espacio generoso, sin elementos innecesarios
- **Personalidad:** Sofisticada pero humana, artística pero accesible

---

## 5. PALETA DE COLORES

### Paleta Principal

| Rol | Nombre | HEX | Uso |
|-----|--------|-----|-----|
| **Fondo primario** | Negro Carbón | `#0D0D0D` | Background principal del sitio |
| **Fondo secundario** | Grafito Profundo | `#1A1A1A` | Secciones alternadas, cards |
| **Texto primario** | Crema Marfil | `#F5F0E8` | Títulos y texto principal |
| **Texto secundario** | Arena Cálida | `#C4B49A` | Subtítulos, meta-texto |
| **Acento primario** | Terracota Suave | `#C97B5A` | CTAs, highlights, hover states |
| **Acento secundario** | Ámbar Dorado | `#D4A853` | Detalles, líneas decorativas |
| **Neutro claro** | Blanco Humo | `#F8F5F0` | Usado en secciones claras |

### Notas de Uso de Color
- El sitio es predominantemente **oscuro** (dark mode como base)
- Los acentos en terracota y ámbar evocan los tonos cálidos característicos de la fotografía de Juanita
- La sección "Sobre mí" puede tener un fondo claro (`#F8F5F0`) para contrastar y dar respiro visual
- Los botones de CTA usan `#C97B5A` con hover en `#D4A853`

---

## 6. TIPOGRAFÍA

### Jerarquía Tipográfica

#### Font 1 — Títulos y Display
**Cormorant Garamond** (Google Fonts)
- Estilo: Serif elegante, con versión en itálica preciosa
- Uso: Hero headline, títulos de sección (H1, H2)
- Weight: 300 (Light) para headlines grandes, 600 (SemiBold) para énfasis
- URL: `https://fonts.google.com/specimen/Cormorant+Garamond`

#### Font 2 — Cuerpo y Navegación
**Josefin Sans** (Google Fonts)
- Estilo: Sans-serif geométrico, limpio y moderno
- Uso: Párrafos, navegación, labels, botones, meta-información
- Weight: 300 (Light) para cuerpo, 400 (Regular) para nav, 600 (SemiBold) para botones
- URL: `https://fonts.google.com/specimen/Josefin+Sans`

#### Font 3 — Acento / Firma
**Great Vibes** (Google Fonts) — Uso muy selectivo
- Estilo: Script cursivo elegante
- Uso: SOLO para el nombre "Juanita" en el logo o firma visual
- Weight: 400
- URL: `https://fonts.google.com/specimen/Great+Vibes`

### Escala Tipográfica
```
Hero H1:        Cormorant Garamond 300 · 72-96px · letter-spacing: 0.02em
H2 (sección):   Cormorant Garamond 600 · 42-56px · letter-spacing: 0.01em
H3 (subsección):Josefin Sans 600 · 22-28px · letter-spacing: 0.12em · UPPERCASE
Body:           Josefin Sans 300 · 16-18px · line-height: 1.8
Navegación:     Josefin Sans 400 · 13-14px · letter-spacing: 0.15em · UPPERCASE
Botones:        Josefin Sans 600 · 13px · letter-spacing: 0.2em · UPPERCASE
Firma/Logo:     Great Vibes 400 · 36-48px
```

### Import de Google Fonts
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Great+Vibes&family=Josefin+Sans:wght@300;400;600&display=swap" rel="stylesheet">
```

---

## 7. ESTRUCTURA DEL SITIO — SECCIONES

### Navegación (Navbar)
- **Posición:** Fixed top, transparente sobre hero → fondo oscuro semitransparente al hacer scroll
- **Logo:** "Juanita" en Great Vibes + "FOTOGRAFÍA" en Josefin Sans Light (letras espaciadas)
- **Links:** Portafolio · Sobre mí · Servicios · Contacto
- **Comportamiento:** Hamburger menu en mobile; en desktop, links en uppercase con underline animado al hover

---

### SECCIÓN 1 — Hero
- **Concepto:** Full-screen (100vh), imagen fotográfica de Juanita como fondo con overlay oscuro gradiente
- **Contenido:**
  - Tag line pequeño arriba: `JUANITA FOTOGRAFÍA · BOGOTÁ`
  - Título grande: `"Retratos que hablan."`  (Cormorant Garamond, itálica)
  - Subtítulo: `"Fotografía editorial y de retrato en Bogotá, Colombia"`
  - CTA Button: `[ Ver Portafolio ]`
  - Scroll indicator: flecha animada hacia abajo
- **Imagen placeholder:** `https://images.unsplash.com/photo-1531746020798-e6953c6e8e04` (moody portrait)
- **Animación:** Fade-in suave del texto al cargar (opacity 0 → 1, translateY +20px → 0)

---

### SECCIÓN 2 — Portafolio
- **Concepto:** Grid masonry / mixed layout con las mejores fotos de Juanita
- **Layout:** 3 columnas en desktop, 2 en tablet, 1 en mobile
- **Interacción:** Hover revela overlay oscuro con título de la serie fotográfica
- **Categorías (tabs/filtros):** `Todos · Retratos · Editorial · Vintage · Sesiones`
- **Imágenes placeholder sugeridas (Unsplash):**
  - `https://images.unsplash.com/photo-1531746020798-e6953c6e8e04` — retrato moody mujer
  - `https://images.unsplash.com/photo-1506794778202-cad84cf45f1d` — retrato hombre cinematográfico
  - `https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e` — retrato mujer elegante
  - `https://images.unsplash.com/photo-1488426862026-3ee34a7d66df` — retrato suave, cálido
  - `https://images.unsplash.com/photo-1501196354995-cbb51c65aaea` — retrato editorial oscuro
  - `https://images.unsplash.com/photo-1531746020798-e6953c6e8e04` — moody cálido
  - `https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d` — retrato vintage
  - `https://images.unsplash.com/photo-1494790108755-2616b612b786` — retrato mujer latinoamericana
  - `https://images.unsplash.com/photo-1517841905240-472988babdf9` — editorial fashion
- **Nota para el dev:** Añadir `?w=800&q=80&fit=crop` al final de cada URL de Unsplash para optimizar

---

### SECCIÓN 3 — Sobre Mí (About)
- **Concepto:** Fondo claro (`#F8F5F0`) — contraste intencional con el resto oscuro del sitio. Da respiro y humaniza.
- **Layout:** Dos columnas — foto de Juanita a la izquierda, texto a la derecha
- **Contenido:**
  - Título: `"Sobre mí"`
  - Foto: retrato de la misma Juanita (íntimo, casual)
  - Texto biográfico de 2-3 párrafos (a definir por el content writer)
  - Detalle visual: línea decorativa en `#C97B5A` separando la foto del texto
- **Imagen placeholder:** `https://images.unsplash.com/photo-1531746020798-e6953c6e8e04`
- **Animación:** Slide-in from left para la foto, fade-in para el texto al hacer scroll (Intersection Observer)

---

### SECCIÓN 4 — Servicios
- **Concepto:** Fondo oscuro retomado. Cards con íconos minimalistas lineales.
- **Layout:** 3 cards en desktop, 1 por fila en mobile
- **Servicios sugeridos:**
  1. **Sesiones de Retrato** — Fotografía íntima y artística de personas
  2. **Fotografía Editorial** — Para marcas, revistas y proyectos creativos
  3. **Proyectos Personales** — Colaboraciones artísticas y proyectos especiales
- **Cada card contiene:** Ícono SVG lineal + Nombre del servicio + Descripción breve (2 líneas) + Link "Saber más"
- **Estilo de cards:** Borde sutil en `rgba(196,180,154,0.2)`, hover eleva la card con sombra suave y muestra el borde en `#C97B5A`

---

### SECCIÓN 5 — Citación / Quote
- **Concepto:** Sección minimalista de una sola frase poderosa — separador visual entre Servicios y Contacto
- **Layout:** Full-width, centrado, con imagen de fondo con overlay oscuro (parallax suave)
- **Contenido:** Una frase sobre fotografía / visión de Juanita (a definir por el content writer)
- **Estilo tipográfico:** Cormorant Garamond itálica, grande (48-64px), crema sobre imagen
- **Imagen de fondo placeholder:** `https://images.unsplash.com/photo-1542038784456-1ea8e935640e` — bokeh cálido

---

### SECCIÓN 6 — Contacto
- **Concepto:** Fondo oscuro, formulario simple y elegante
- **Layout:** Dos columnas — datos de contacto a la izquierda, formulario a la derecha
- **Campos del formulario:** Nombre · Email · Mensaje · Botón `[ Enviar Mensaje ]`
- **Datos de contacto:**
  - Instagram: @juanita_g21
  - Ubicación: Bogotá, Colombia
  - Email: (a definir con la cliente)
- **Estilo:** Inputs con borde bottom solamente (underline style), sin bordes cuadrados — se ve más elegante
- **Animación del botón:** Background sweep de `#C97B5A` al hover

---

### Footer
- **Contenido:** Logo · Links de navegación · Copyright `© 2025 Juanita González · Todos los derechos reservados`
- **Ícono Instagram:** Link al perfil
- **Fondo:** `#0D0D0D` (idéntico al fondo del sitio)
- **Línea superior:** `1px solid rgba(196,180,154,0.15)`

---

## 8. LAYOUT Y GRID

### Sistema de Grid
- **Max-width del contenido:** `1200px` centrado
- **Padding horizontal:** `80px` en desktop · `40px` en tablet · `20px` en mobile
- **Grid base:** CSS Grid 12 columnas
- **Gap entre secciones:** `120px` en desktop · `80px` en mobile

### Breakpoints
```css
Mobile:  < 768px
Tablet:  768px – 1024px
Desktop: > 1024px
Wide:    > 1440px
```

---

## 9. EFECTOS Y ANIMACIONES

### Filosofía de Animación
Suaves, lentas y cinematográficas. Nada que distraiga de las fotos. La animación es el "suspiro" del sitio.

### Animaciones Específicas

#### Al Cargar (Page Load)
```
- Hero image: fade-in con zoom muy suave (scale 1.02 → 1.0) en 1.5s
- Hero text: staggered fade-in + translateY(20px → 0) con delay de 0.3s entre elementos
- Navbar: fade-in desde arriba en 0.5s
```

#### Al Hacer Scroll (Intersection Observer)
```
- Secciones: fade-in + translateY(30px → 0) con threshold 0.1
- Fotos del grid: staggered entrance (cada foto aparece con 0.1s de delay)
- Cards de servicios: slide-up con delay escalonado
- Quote section: parallax suave en el background image (factor 0.3)
```

#### Hover States
```
- Fotos del portafolio: overlay oscuro aparece + título de la serie (opacity 0 → 1 en 0.3s)
- Cards de servicios: translateY(-4px) + box-shadow sutil + borde en terracota
- Links de navegación: underline que crece desde el centro (pseudo-element)
- Botón CTA: background color sweep de izquierda a derecha
- Ícono Instagram: color fill terracota en 0.2s
```

#### Cursor Personalizado (Opcional — solo desktop)
```
- Cursor: dot pequeño en terracota (#C97B5A) que sigue el mouse
- Sobre imágenes: cursor se expande (scale 3x) mostrando texto "VER"
```

#### Transición entre Secciones
```
- Scroll suave: scroll-behavior: smooth
- Sin page transitions (single-page site)
```

### Librería de Animación Recomendada
- **GSAP (GreenSock)** para animaciones más complejas del hero y cursor
- **CSS Transitions** nativas para hovers y estados simples
- **Intersection Observer API** (vanilla JS) para animaciones al scroll
- **CSS scroll-behavior: smooth** para navegación

---

## 10. COMPONENTES UI DETALLADOS

### Botones
```css
/* Botón primario */
.btn-primary {
  background: transparent;
  border: 1px solid #C97B5A;
  color: #F5F0E8;
  padding: 14px 36px;
  font-family: 'Josefin Sans', sans-serif;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.3s ease;
}
.btn-primary:hover {
  background: #C97B5A;
  color: #0D0D0D;
}
```

### Inputs del Formulario
```css
/* Input underline style */
.form-input {
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(196,180,154,0.4);
  color: #F5F0E8;
  font-family: 'Josefin Sans', sans-serif;
  font-size: 16px;
  font-weight: 300;
  padding: 12px 0;
  width: 100%;
  transition: border-color 0.3s ease;
}
.form-input:focus {
  outline: none;
  border-bottom-color: #C97B5A;
}
```

### Hover de Fotos del Portafolio
```css
.portfolio-item {
  position: relative;
  overflow: hidden;
  cursor: pointer;
}
.portfolio-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.6s ease;
}
.portfolio-item:hover img {
  transform: scale(1.05);
}
.portfolio-overlay {
  position: absolute;
  inset: 0;
  background: rgba(13,13,13,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.portfolio-item:hover .portfolio-overlay {
  opacity: 1;
}
```

---

## 11. IMÁGENES PLACEHOLDER (Unsplash)

Todas las URLs deben ser reemplazadas por las fotos reales de Juanita.
Para optimización: añadir `?w=1200&q=80&fit=crop&auto=format` a cada URL.

| Sección | Descripción | URL Unsplash |
|---------|-------------|------|
| Hero BG | Retrato moody, mujer | `https://images.unsplash.com/photo-1531746020798-e6953c6e8e04` |
| Portafolio 1 | Retrato femenino cálido | `https://images.unsplash.com/photo-1494790108755-2616b612b786` |
| Portafolio 2 | Retrato editorial oscuro | `https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e` |
| Portafolio 3 | Portrait cinematográfico | `https://images.unsplash.com/photo-1506794778202-cad84cf45f1d` |
| Portafolio 4 | Retrato suave, íntimo | `https://images.unsplash.com/photo-1488426862026-3ee34a7d66df` |
| Portafolio 5 | Editorial moda | `https://images.unsplash.com/photo-1517841905240-472988babdf9` |
| Portafolio 6 | Retrato vintage | `https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d` |
| Portafolio 7 | Retrato mujer latina | `https://images.unsplash.com/photo-1488426862026-3ee34a7d66df` |
| Portafolio 8 | Close-up íntimo | `https://images.unsplash.com/photo-1501196354995-cbb51c65aaea` |
| About foto | Juanita (casual/artístico) | `https://images.unsplash.com/photo-1531746020798-e6953c6e8e04` |
| Quote BG | Bokeh cálido/atmosférico | `https://images.unsplash.com/photo-1542038784456-1ea8e935640e` |

---

## 12. ARQUITECTURA TÉCNICA SUGERIDA

### Stack Tecnológico
- **HTML5** semántico
- **CSS3** — Variables CSS, Grid, Flexbox, Custom Properties
- **JavaScript** Vanilla (ES6+) — sin frameworks pesados
- **GSAP** (CDN) para animaciones avanzadas
- **Google Fonts** para tipografía
- **Deploy:** Cloudflare Pages (conforme brief del proyecto)

### Estructura de Archivos
```
/
├── index.html
├── css/
│   ├── main.css         # Estilos globales, variables, reset
│   ├── layout.css       # Grid, secciones, estructura
│   ├── components.css   # Buttons, forms, cards, nav
│   └── animations.css   # Keyframes, transitions
├── js/
│   ├── main.js          # Init, scroll events, Intersection Observer
│   ├── animations.js    # GSAP animations
│   └── portfolio.js     # Filtro de portafolio (tabs)
└── assets/
    └── images/          # Fotos de Juanita (reemplazar placeholders)
```

### Variables CSS
```css
:root {
  /* Colores */
  --color-bg-primary:     #0D0D0D;
  --color-bg-secondary:   #1A1A1A;
  --color-text-primary:   #F5F0E8;
  --color-text-secondary: #C4B49A;
  --color-accent-1:       #C97B5A;
  --color-accent-2:       #D4A853;
  --color-light:          #F8F5F0;

  /* Tipografía */
  --font-display:  'Cormorant Garamond', Georgia, serif;
  --font-body:     'Josefin Sans', Arial, sans-serif;
  --font-script:   'Great Vibes', cursive;

  /* Espaciado */
  --section-gap:   120px;
  --content-max:   1200px;
  --radius-sm:     4px;

  /* Transiciones */
  --transition-fast:   0.2s ease;
  --transition-base:   0.3s ease;
  --transition-slow:   0.6s ease;
  --transition-cinema: 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
```

---

## 13. SEO Y METADATA

```html
<title>Juanita González | Fotógrafa de Retratos en Bogotá, Colombia</title>
<meta name="description" content="Fotógrafa de retratos editorial y cinematográfico en Bogotá, Colombia. Sesiones personales, editoriales y proyectos creativos.">
<meta property="og:title" content="Juanita González Fotografía">
<meta property="og:description" content="Retratos que hablan. Fotografía editorial y de retrato en Bogotá.">
<meta property="og:image" content="[hero-image-url]">
<meta name="theme-color" content="#0D0D0D">
```

---

## 14. TONO Y VOZ DEL SITIO

### Personalidad de la Marca
- **Artística y auténtica** — No genérica, no corporativa
- **Íntima** — Como si Juanita te hablara directamente
- **Colombiana y orgullosa** — Referencia sutil a Bogotá y su identidad cultural
- **Confiada pero cercana** — No arrogante, no servil

### Guía de Voz (para el Content Writer)
- ✅ Frases cortas con impacto
- ✅ Primera persona singular (`yo creo`, `mi trabajo`, `te acompañaré`)
- ✅ Verbos activos y presentes
- ✅ Algunas expresiones colombianas naturales (sin exagerar)
- ❌ NO usar jerga corporativa (`soluciones integrales`, `calidad garantizada`)
- ❌ NO usar exclamaciones excesivas
- ❌ NO listas largas — mejor párrafos cortos con intención

### Ejemplos de Tono
- Hero: `"Retratos que hablan."` — simple, directo, poético
- About: `"Nací en Bogotá y aprendí a ver el mundo a través de un lente."` — íntimo
- CTA: `"Hablemos de tu sesión"` — cercano, no `"¡Contáctame ya!"`

---

## 15. CHECKLIST PARA EL DESARROLLADOR

- [ ] Implementar dark theme como base (fondo `#0D0D0D`)
- [ ] Importar las 3 fuentes de Google Fonts
- [ ] Definir todas las variables CSS en `:root`
- [ ] Navbar fija con cambio de fondo al scroll (JS)
- [ ] Hero: imagen full-screen con overlay gradiente + animación de entrada
- [ ] Grid masonry del portafolio con filtros por categoría
- [ ] Hover effect en las fotos (overlay + título)
- [ ] Sección "Sobre mí" con fondo claro (contraste intencional)
- [ ] Cards de servicios con hover animado
- [ ] Sección Quote con parallax suave
- [ ] Formulario de contacto con inputs estilo underline
- [ ] Footer con links + Instagram
- [ ] Scroll suave (CSS + JS)
- [ ] Intersection Observer para animaciones al scroll
- [ ] Responsive en mobile, tablet y desktop
- [ ] Optimización de imágenes (loading="lazy" en todas)
- [ ] Meta tags SEO completos
- [ ] Deploy en Cloudflare Pages

---

## 16. NOTAS FINALES

1. **Prioridad absoluta:** Las fotos de Juanita son las protagonistas. El diseño es el marco.
2. **Performance:** El sitio debe cargar rápido — lazy loading obligatorio en todas las imágenes.
3. **Mobile-first:** Diseño plenamente funcional en móvil (la mayoría de sus seguidores vienen de Instagram, que es mobile).
4. **Reemplazo de placeholders:** Todas las URLs de Unsplash deben ser reemplazadas por las fotos reales de Juanita antes del deploy final.
5. **Formulario de contacto:** Usar Cloudflare Workers o Formspree para el backend del formulario (sin servidor propio).
6. **Cursor personalizado:** Implementar solo en desktop (verificar `window.matchMedia('(pointer: fine)')`).

---

*Documento elaborado por: Design Researcher Agent*  
*Fecha: Abril 2026*  
*Versión: 1.0*  
*Próximo paso: Content Writer redacta todos los textos del sitio en español colombiano basándose en este brief.*
