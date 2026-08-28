/**
 * Graders — the ES `usted`-register lint (I18N-07).
 *
 * The positive/negative table is the point of this suite: an over-eager
 * heuristic that flags correct `usted`-register Costa Rican Spanish is as
 * broken as one that misses real tú/vos slips. See
 * `scripts/check-es-register.mjs`'s module docstring for the grammar this
 * table is built to prove (future tense vs. vos imperative both ending in an
 * accented vowel, `está` vs. `estás`, common non-verb -ás/-és/-ís words).
 *
 * refs specs/001-foundation (I18N-07)
 */
import { describe, expect, it } from "vitest";
import {
  auditContentRegister,
  auditUiEsBlock,
  classifyWord,
  extractUiEsBlockStrings,
  findEntryRegisterIssues,
  findRegisterViolations,
} from "../scripts/check-es-register.mjs";

/**
 * Real (or realistic) Costa Rican Spanish sentences that use tú/vos —
 * `classifyWord` must flag at least one word in each.
 */
const POSITIVE_SENTENCES: readonly string[] = [
  "Si tú revisas el nivel de aceite, vas a ver la varilla.",
  "Vos podés cambiar el filtro sin herramientas especiales.",
  "Revisá el nivel de líquido de frenos antes de salir.",
  "Este es tu carro, así que cuidalo vos mismo.",
  "¿Tenés el número de parte a mano?",
  "Con esta llave vos aflojás el perno sin problema.",
  "Sabés que el kit trae las juntas nuevas.",
  "Estás a tiempo de hacer el cambio de aceite.",
  "Vos fijate que la banda no esté floja.",
  "Contigo cerca, el trabajo es más rápido.",
];

/**
 * Correct `usted`-register Costa Rican Spanish — every sentence here is
 * exactly the register the site requires and must classify clean.
 */
const NEGATIVE_SENTENCES: readonly string[] = [
  "Revise el nivel de aceite antes de arrancar el motor.",
  "Usted puede cambiar el filtro sin herramientas especiales.",
  "El sistema está funcionando dentro de lo normal.",
  "Además, el motor tendrá que enfriarse antes de revisarlo.",
  "El fabricante dirá cuál es el par de apriete correcto.",
  "La camioneta se venderá con el tanque lleno.",
  "Después de revisar el nivel, cierre la tapa con cuidado.",
  "El país no tiene una norma específica para este caso.",
  "Es una banda de repuesto para las llantas y las piezas del motor.",
  "Así funciona el sistema de frenos en este modelo.",
  "Consulte a un mecánico calificado para trabajos críticos de seguridad.",
  "El torque especificado es de 88 newton-metro para este perno.",
];

describe("classifyWord — CR-Spanish table", () => {
  it.each(POSITIVE_SENTENCES)("flags at least one word: %s", (sentence) => {
    expect(findRegisterViolations(sentence).length).toBeGreaterThan(0);
  });

  it.each(NEGATIVE_SENTENCES)("flags nothing: %s", (sentence) => {
    expect(findRegisterViolations(sentence)).toEqual([]);
  });
});

describe("classifyWord — targeted word list", () => {
  const positives = [
    "tú",
    "tu",
    "tus",
    "vos",
    "ti",
    "contigo",
    "revisas",
    "tienes",
    "puedes",
    "sabes",
    "estás",
    "revisá",
    "tenés",
    "vivís",
    "hablás",
    "comé",
    "decís",
    "sos",
    "cambiás",
  ];
  const negatives = [
    // Non-verb words ending in the suffix rule's stressed vowel + s.
    "además",
    "detrás",
    "atrás",
    "jamás",
    "compás",
    "quizás",
    "país",
    "países",
    "después",
    "través",
    "revés",
    "inglés",
    "francés",
    "interés",
    // Bare-accented-vowel usted/1st-person forms — never scanned since the
    // suffix rule requires a trailing -s (module docstring point 3).
    "está",
    "esté",
    "dé",
    "sé",
    "están",
    "acá",
    "allá",
    "papá",
    "mamá",
    "café",
    "así",
    "aquí",
    "allí",
    // Usted future tense (bare -rá — also never scanned; no trailing -s).
    "tendrá",
    "hará",
    "estará",
    "vendrá",
    "funcionará",
    "revisará",
    "cambiará",
    "dirá",
    "podrá",
    "saldrá",
    "habrá",
    "irá",
    // First-hand 1st-person preterite narration ("yo revisé el nivel…").
    "revisé",
    "recibí",
    "viví",
    "medí",
    "pedí",
    "seguí",
    // Ordinary usted-compatible present tense / plural nouns.
    "revisa",
    "cambia",
    "va",
    "da",
    "es",
    "son",
    "usted",
    "repuestos",
    "aro",
    "taller",
    "carro",
    "llantas",
    "piezas",
    "válvulas",
    "especificaciones",
  ];

  it.each(positives)("classifies %s as informal", (word) => {
    expect(classifyWord(word)).not.toBeNull();
  });

  it.each(negatives)("does not classify %s as informal", (word) => {
    expect(classifyWord(word)).toBeNull();
  });
});

describe("findEntryRegisterIssues", () => {
  it("is clean for usted-register prose.es", () => {
    const entry = {
      file: "src/content/procedures/g3-cambio-aceite.md",
      data: {
        prose: {
          en: { title: "Oil change", summary: "Steps." },
          es: {
            title: "Cambio de aceite",
            summary: "Revise el nivel antes de arrancar el motor.",
          },
        },
      },
    };
    expect(findEntryRegisterIssues(entry)).toEqual([]);
  });

  it("flags a tú/vos slip in prose.es, naming the field and word", () => {
    const entry = {
      file: "src/content/procedures/g3-cambio-aceite.md",
      data: {
        prose: {
          en: { title: "Oil change", summary: "Steps." },
          es: {
            title: "Cambio de aceite",
            summary: "Revisá el nivel antes de arrancar el motor.",
          },
        },
      },
    };
    const issues = findEntryRegisterIssues(entry);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe("prose.es.summary");
    expect(issues[0]?.word.toLowerCase()).toBe("revisá");
    expect(issues[0]?.message).toMatch(/usted.*register only/);
  });

  it("does not scan prose.en at all", () => {
    const entry = {
      file: "x.md",
      data: {
        prose: {
          en: { title: "You should check your oil, dude." },
          es: { title: "Revise el aceite." },
        },
      },
    };
    expect(findEntryRegisterIssues(entry)).toEqual([]);
  });

  it("returns [] when prose.es is absent", () => {
    expect(
      findEntryRegisterIssues({ file: "x.md", data: { prose: { en: {} } } })
    ).toEqual([]);
  });
});

describe("auditContentRegister", () => {
  it("aggregates across entries", () => {
    const clean = {
      file: "a.md",
      data: { prose: { es: { title: "Revise el aceite." } } },
    };
    const dirty = {
      file: "b.md",
      data: { prose: { es: { title: "Revisá el aceite." } } },
    };
    expect(auditContentRegister([clean, dirty])).toHaveLength(1);
  });
});

describe("extractUiEsBlockStrings / auditUiEsBlock", () => {
  const SOURCE = `
import { LOCALES } from "./routing";
export interface UiStrings { readonly a: string; }
const en: UiStrings = {
  a: "Skip to content",
};
const es: UiStrings = {
  a: "Saltar al contenido",
  b: \`Bienvenido, \${NAME}\`,
};
export const ui = { en, es };
`;

  it("extracts only the es block's string values", () => {
    const values = extractUiEsBlockStrings(SOURCE);
    expect(values).toContain("Saltar al contenido");
    expect(values.some((v: string) => v.includes("Bienvenido"))).toBe(true);
    expect(values).not.toContain("Skip to content");
  });

  it("is clean for a correctly usted-register es block", () => {
    expect(auditUiEsBlock(SOURCE)).toEqual([]);
  });

  it("flags a tú/vos slip in the es block", () => {
    const dirty = SOURCE.replace(
      "Saltar al contenido",
      "Vos saltás al contenido"
    );
    const issues = auditUiEsBlock(dirty);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.file).toBe("src/i18n/ui.ts");
  });

  it("returns [] when the file has no es block", () => {
    expect(extractUiEsBlockStrings("export const x = 1;")).toEqual([]);
  });
});
