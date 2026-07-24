import { Router } from "express";
import { db } from "../db.js";

export const cie11Router = Router();

// API pública y gratuita de la National Library of Medicine (EE.UU.), sin
// necesidad de clave ni cuenta: catálogo ICD-10-CM completo (~70,000
// códigos), que a nivel de código base (letra + 2-3 dígitos, ej. "J22",
// "A09.1") coincide con el CIE-10 usado en la región para propósitos de
// certificados/recetas. No es idéntico byte a byte al catálogo oficial
// CIE-10 de cada país (ICD-10-CM agrega extensiones propias de EE.UU. a
// partir del 5º carácter), pero para el nivel de detalle que se usa en la
// práctica diaria es, por lejos, más completo que cualquier catálogo
// hecho a mano.
const NLM_ICD10_URL = "https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search";

async function searchExternalCatalog(query) {
  // df=code,name pide explícitamente que cada fila de "display" venga como
  // [código, nombre] — así no hay que adivinar el formato de respuesta.
  const url = `${NLM_ICD10_URL}?sf=code,name&df=code,name&terms=${encodeURIComponent(query)}&maxList=10`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    // Formato: [totalResultados, codigos[], camposExtra, filas[][]] — con
    // df=code,name, cada fila es [codigo, nombre].
    const [, codes, , display] = data;
    if (!Array.isArray(codes) || codes.length === 0) return [];
    return codes.map((code, i) => {
      const row = display?.[i];
      const label = Array.isArray(row) ? row[1] || row[0] : row;
      return { code, label: label || code };
    });
  } catch {
    // Sin internet, timeout, o la API externa caída puntualmente: null
    // (distinto de "sin resultados") para que el llamador use el catálogo
    // local en vez de mostrarle al médico una lista vacía.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function searchLocalCatalog(query) {
  const like = `%${query}%`;
  return db
    .prepare(`SELECT code, label FROM cie11_catalog WHERE label ILIKE ? OR code ILIKE ? ORDER BY label LIMIT 10`)
    .all(like, like);
}

// GET /api/cie11?q=diabet -> catálogo CIE-10 completo (API externa).
// Si esa API no responde por cualquier motivo, cae de vuelta al catálogo
// local reducido (~100 diagnósticos) para que el buscador nunca se quede
// completamente vacío.
cie11Router.get("/", async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.json([]);

  const external = await searchExternalCatalog(q.trim());
  if (external && external.length > 0) return res.json(external);
  if (external && external.length === 0) return res.json([]); // la API sí respondió, de verdad no hay coincidencias

  // external === null -> la API externa no respondió, usamos el respaldo local
  const local = await searchLocalCatalog(q.trim());
  res.json(local);
});
