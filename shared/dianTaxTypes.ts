export const DIAN_ORGANIZATION_TYPES = [
  { id: 1, name: "Persona Jurídica", description: "Empresa o sociedad legalmente constituida" },
  { id: 2, name: "Persona Natural", description: "Individuo o persona física" },
] as const;

export const DIAN_TAX_REGIMES = [
  { id: 1, name: "Régimen Simple de Tributación", description: "RST - Régimen Simple" },
  { id: 2, name: "No Responsable de IVA", description: "No responsable del impuesto sobre las ventas" },
  { id: 48, name: "Responsable de IVA", description: "Responsable del impuesto sobre las ventas" },
  { id: 49, name: "Gran Contribuyente", description: "Calificado como Gran Contribuyente por la DIAN" },
] as const;

export const DIAN_TAX_LIABILITIES = [
  { id: 117, name: "No Responsable", description: "No responsable de tributos" },
  { id: 7, name: "Gran Contribuyente", description: "Calificado como Gran Contribuyente" },
  { id: 9, name: "Autorretenedor", description: "Autorizado como Autorretenedor" },
  { id: 14, name: "Informar Exógena", description: "Obligado a informar exógena" },
  { id: 21, name: "Agente Retención IVA", description: "Agente de Retención de IVA" },
  { id: 29, name: "IVA Régimen Común", description: "Responsable de IVA - Régimen Común" },
  { id: 30, name: "Declarante Renta", description: "Declarante de Renta" },
  { id: 37, name: "Retención Fuente", description: "Obligado a practicar retención en la fuente" },
] as const;

export type DianOrganizationType = typeof DIAN_ORGANIZATION_TYPES[number]["id"];
export type DianTaxRegime = typeof DIAN_TAX_REGIMES[number]["id"];
export type DianTaxLiability = typeof DIAN_TAX_LIABILITIES[number]["id"];

export function getOrganizationTypeName(id: number): string {
  const org = DIAN_ORGANIZATION_TYPES.find(o => o.id === id);
  return org?.name || String(id);
}

export function getTaxRegimeName(id: number): string {
  const regime = DIAN_TAX_REGIMES.find(r => r.id === id);
  return regime?.name || String(id);
}

export function getTaxLiabilityName(id: number): string {
  const liability = DIAN_TAX_LIABILITIES.find(l => l.id === id);
  return liability?.name || String(id);
}
