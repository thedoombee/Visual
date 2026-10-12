// ---------- Publication d'un snapshot sur un hébergeur public ----------
// Pourquoi : un lien `http://localhost:5173/#partage=...` ne sort JAMAIS de
// ta machine. Pour un lien ouvrable partout dans le monde sans héberger
// l'app, on envoie le schéma (image SVG) sur un hébergeur public gratuit et
// on rend l'URL mondiale. Zéro compte, zéro backend à nous.
//
// Principe Ouvert/Fermé : un nouvel hébergeur = un objet `Publisher`
// ajouté à `PUBLISHERS`, sans toucher au modal ni à `App`.

export interface PublishResult {
  /** URL publique mondiale (page de téléchargement / visualisation). */
  url: string;
  /** Nom de l'hébergeur (affiché sous le lien). */
  host: string;
  /** Durée de conservation annoncée (affichée sous le lien). */
  retention: string;
}

export interface Publisher {
  id: string;
  publish: (filename: string, content: string, mime: string) => Promise<PublishResult>;
}

/** Garde-fou : nos SVG font quelques Ko ; au-delà, on refuse poliment. */
const MAX_CHARS = 8_000_000;

function checkSize(content: string): void {
  if (content.length > MAX_CHARS) {
    throw new Error(
      "Schéma trop volumineux pour la publication gratuite (> 8 Mo). Exporte-le en SVG/PNG et envoie le fichier toi-même."
    );
  }
}

// ----- Gofile (principal) : anonyme, CORS navigateur OK, page publique -----
// Conservation : ~10 jours après la dernière visite. Re-publie pour un lien frais.
let cachedServer = "";
let cachedAt = 0;

async function pickGofileServer(): Promise<string> {
  // Le meilleur serveur change ; cache de 10 min pour éviter 2 allers-retours.
  if (cachedServer && Date.now() - cachedAt < 10 * 60_000) return cachedServer;
  const r = await fetch("https://api.gofile.io/servers");
  if (!r.ok) throw new Error(`Gofile injoignable (HTTP ${r.status}). Vérifie ta connexion.`);
  const j = (await r.json()) as { status: string; data?: { servers?: { name: string }[] } };
  const name = j.data?.servers?.[0]?.name;
  if (!name) throw new Error("Gofile n'a proposé aucun serveur. Réessaie dans une minute.");
  cachedServer = name;
  cachedAt = Date.now();
  return name;
}

const gofilePublisher: Publisher = {
  id: "gofile",
  publish: async (filename, content, mime) => {
    checkSize(content);
    const server = await pickGofileServer();
    const fd = new FormData();
    fd.append("file", new Blob([content], { type: mime }), filename);
    const r = await fetch(`https://${server}.gofile.io/uploadFile`, { method: "POST", body: fd });
    if (!r.ok) throw new Error(`Gofile a refusé l'envoi (HTTP ${r.status}). Réessaie dans une minute.`);
    const j = (await r.json()) as { status: string; data?: { downloadPage?: string } };
    if (j.status !== "ok" || !j.data?.downloadPage) {
      throw new Error("Gofile n'a pas renvoyé de lien. Réessaie.");
    }
    return {
      url: j.data.downloadPage,
      host: "Gofile",
      retention: "lien public mondial, conservé ~10 jours après la dernière visite",
    };
  },
};

// ----- Tmpfiles (repli) : anonyme, CORS OK, conservation courte (~1 h) -----
const tmpfilesPublisher: Publisher = {
  id: "tmpfiles",
  publish: async (filename, content, mime) => {
    checkSize(content);
    const fd = new FormData();
    fd.append("file", new Blob([content], { type: mime }), filename);
    const r = await fetch("https://tmpfiles.org/api/v1/upload", { method: "POST", body: fd });
    if (!r.ok) throw new Error(`Repli injoignable (HTTP ${r.status}).`);
    const j = (await r.json()) as { status?: string; data?: { url?: string } };
    if (!j.data?.url) throw new Error("Le repli n'a pas renvoyé de lien.");
    return {
      url: j.data.url.replace("tmpfiles.org/", "tmpfiles.org/dl/"),
      host: "Tmpfiles",
      retention: "lien de secours, courte durée (~1 h)",
    };
  },
};

const PUBLISHERS: Publisher[] = [gofilePublisher, tmpfilesPublisher];

/** Publie et rend l'URL mondiale. Essaie chaque hébergeur dans l'ordre. */
export async function publishWorldwide(
  filename: string,
  content: string,
  mime: string
): Promise<PublishResult> {
  const errors: string[] = [];
  for (const p of PUBLISHERS) {
    try {
      return await p.publish(filename, content, mime);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(
    `Publication impossible pour le moment. ${errors.join(" ")} Vérifie ta connexion puis réessaie — sinon exporte en SVG/PNG et héberge le fichier (ou l'app) toi-même.`
  );
}
