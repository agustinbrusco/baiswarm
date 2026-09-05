// Markdown (GFM sin ~tachado simple~), saltos de línea simples y fórmulas con KaTeX: $$…$$ en línea o en su propio
// párrafo. El $ solo queda libre para precios ("$500"), que acá son más comunes que las fórmulas.
// Sin HTML crudo (react-markdown lo muestra como texto) y sin imágenes: se rinden como link.
// Estilos de bloque en index.css bajo `.md`; colores por variables CSS desde theme.js.
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { C } from "./theme.js";

const remarkPlugins = [[remarkGfm, { singleTilde: false }], remarkBreaks, [remarkMath, { singleDollarTextMath: false }]];
const rehypePlugins = [[rehypeKatex, { errorColor: C.down }]];
const Strong = ({ children }) => <p><strong>{children}</strong></p>;
const components = {
  a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
  img: ({ src, alt }) => <a href={src} target="_blank" rel="noreferrer">{alt || src}</a>,
  h1: Strong, h2: Strong, h3: Strong, h4: Strong, h5: Strong, h6: Strong,
  table: ({ children }) => <div className="overflow-x-auto"><table>{children}</table></div>,
};
const vars = { "--md-line": C.line, "--md-muted": C.muted, "--md-soft": C.paper, "--md-accent": C.accent };

export const MD_HINT = "Podés usar markdown; fórmulas entre $$.";

export default function Md({ text, size = 16, color = C.ink, className = "" }) {
  return (
    <div className={`md leading-relaxed ${className}`} style={{ fontSize: size, color, ...vars }}>
      <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>{text}</Markdown>
    </div>
  );
}
