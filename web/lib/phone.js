// WhatsApp numbers are kept as digits with the country code, the way Meta sends them: 14075551234.
export const COUNTRIES = [
  ["1", "US / Canada / PR / DR"], ["52", "Mexico"], ["57", "Colombia"], ["58", "Venezuela"], ["51", "Peru"], ["593", "Ecuador"],
  ["56", "Chile"], ["54", "Argentina"], ["55", "Brazil"], ["502", "Guatemala"], ["503", "El Salvador"], ["504", "Honduras"],
  ["505", "Nicaragua"], ["506", "Costa Rica"], ["507", "Panama"], ["53", "Cuba"], ["591", "Bolivia"], ["595", "Paraguay"],
  ["598", "Uruguay"], ["34", "Spain"], ["44", "United Kingdom"], ["33", "France"], ["39", "Italy"], ["49", "Germany"],
  ["351", "Portugal"], ["353", "Ireland"], ["61", "Australia"], ["64", "New Zealand"], ["91", "India"], ["63", "Philippines"],
  ["81", "Japan"], ["82", "South Korea"], ["86", "China"], ["66", "Thailand"], ["84", "Vietnam"], ["90", "Turkey"],
  ["971", "United Arab Emirates"], ["972", "Israel"], ["27", "South Africa"], ["234", "Nigeria"],
];

// The number as digits with its country code, or null. A number typed with "+" or "00" already carries its country.
export function normalizePhone(raw, country = "1") {
  const s = String(raw || "").trim();
  if (!s) return null;
  let d = s.replace(/\D/g, "");
  if (s.startsWith("+")) { /* already international */ }
  else if (s.startsWith("00")) d = d.slice(2);
  else {
    const cc = String(country || "1").replace(/\D/g, "") || "1";
    if (cc === "1" && d.length === 11 && d.startsWith("1")) { /* typed the 1 already */ }
    else if (cc !== "1" && d.startsWith(cc) && d.length > 10) { /* typed the country code already */ }
    else d = cc + d.replace(/^0+/, "");
  }
  if (d.startsWith("1") && d.length !== 11) return null;
  return /^[0-9]{8,15}$/.test(d) ? d : null;
}

// 14075551234 -> +1 407-555-1234
export function prettyPhone(d) {
  if (!d) return "";
  if (d.length === 11 && d.startsWith("1")) return `+1 ${d.slice(1, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
  return `+${d}`;
}
