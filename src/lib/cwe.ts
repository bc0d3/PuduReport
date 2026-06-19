// Catalogo curado de los CWE mas usados en pentest web, bug bounty e infra.
// Evita tener que buscar el numero a mano: el editor ofrece esta lista y el
// usuario igual puede escribir un CWE que no este aca. El orden es por
// frecuencia/relevancia aproximada en reportes (los mas comunes primero).
//
// Los nombres se dejan en su forma corta canonica en ingles (con la sigla
// habitual entre parentesis) porque es el termino con el que se busca el CWE.

export interface CweEntry {
  /** Identificador con prefijo, por ejemplo "CWE-89". */
  id: string;
  /** Nombre corto canonico del CWE. */
  name: string;
}

export const COMMON_CWES: CweEntry[] = [
  { id: "CWE-79", name: "Cross-site Scripting (XSS)" },
  { id: "CWE-89", name: "SQL Injection" },
  { id: "CWE-639", name: "Authorization Bypass Through User-Controlled Key (IDOR)" },
  { id: "CWE-918", name: "Server-Side Request Forgery (SSRF)" },
  { id: "CWE-287", name: "Improper Authentication" },
  { id: "CWE-862", name: "Missing Authorization" },
  { id: "CWE-863", name: "Incorrect Authorization" },
  { id: "CWE-284", name: "Improper Access Control" },
  { id: "CWE-352", name: "Cross-Site Request Forgery (CSRF)" },
  { id: "CWE-601", name: "URL Redirection to Untrusted Site (Open Redirect)" },
  { id: "CWE-434", name: "Unrestricted Upload of File with Dangerous Type" },
  { id: "CWE-22", name: "Path Traversal" },
  { id: "CWE-78", name: "OS Command Injection" },
  { id: "CWE-94", name: "Code Injection" },
  { id: "CWE-1336", name: "Server-Side Template Injection (SSTI)" },
  { id: "CWE-611", name: "Improper Restriction of XML External Entity Reference (XXE)" },
  { id: "CWE-502", name: "Deserialization of Untrusted Data" },
  { id: "CWE-200", name: "Exposure of Sensitive Information" },
  { id: "CWE-209", name: "Generation of Error Message Containing Sensitive Information" },
  { id: "CWE-798", name: "Use of Hard-coded Credentials" },
  { id: "CWE-522", name: "Insufficiently Protected Credentials" },
  { id: "CWE-319", name: "Cleartext Transmission of Sensitive Information" },
  { id: "CWE-311", name: "Missing Encryption of Sensitive Data" },
  { id: "CWE-327", name: "Use of a Broken or Risky Cryptographic Algorithm" },
  { id: "CWE-330", name: "Use of Insufficiently Random Values" },
  { id: "CWE-915", name: "Mass Assignment" },
  { id: "CWE-942", name: "Permissive Cross-domain Policy (CORS)" },
  { id: "CWE-1021", name: "Improper Restriction of Rendered UI Layers (Clickjacking)" },
  { id: "CWE-384", name: "Session Fixation" },
  { id: "CWE-613", name: "Insufficient Session Expiration" },
  { id: "CWE-295", name: "Improper Certificate Validation" },
  { id: "CWE-306", name: "Missing Authentication for Critical Function" },
  { id: "CWE-307", name: "Improper Restriction of Excessive Authentication Attempts" },
  { id: "CWE-269", name: "Improper Privilege Management" },
  { id: "CWE-20", name: "Improper Input Validation" },
  { id: "CWE-77", name: "Command Injection" },
  { id: "CWE-90", name: "LDAP Injection" },
  { id: "CWE-113", name: "HTTP Response Splitting" },
  { id: "CWE-444", name: "Inconsistent Interpretation of HTTP Requests (Request Smuggling)" },
  { id: "CWE-400", name: "Uncontrolled Resource Consumption" },
  { id: "CWE-770", name: "Allocation of Resources Without Limits or Throttling" },
  { id: "CWE-732", name: "Incorrect Permission Assignment for Critical Resource" },
  { id: "CWE-276", name: "Incorrect Default Permissions" },
  { id: "CWE-426", name: "Untrusted Search Path" },
  { id: "CWE-916", name: "Use of Password Hash With Insufficient Computational Effort" },
  { id: "CWE-117", name: "Improper Output Neutralization for Logs" },
  { id: "CWE-359", name: "Exposure of Private Personal Information" },
];
