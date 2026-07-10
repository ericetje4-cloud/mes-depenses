// Déclarations de types pour les modules sans types TS fournis.

// mammoth : on importe le build navigateur qui n'a pas de .d.ts.
declare module 'mammoth/mammoth.browser' {
  export interface ExtractResult {
    value: string;
    messages?: unknown[];
  }
  export function extractRawText(options: {
    arrayBuffer: ArrayBuffer;
  }): Promise<ExtractResult>;
  const _default: { extractRawText: typeof extractRawText };
  export default _default;
}
