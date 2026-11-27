import { handleUpload } from '@vercel/blob/client';

// Délivre un jeton d'envoi au navigateur (fichiers STL/OBJ/3MF, 100 Mo max chacun).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  try {
    const json = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!/^demandes\/.+\.(stl|obj|3mf)$/i.test(pathname)) throw new Error('Fichier non autorisé.');
        return { maximumSizeInBytes: 100 * 1024 * 1024, addRandomSuffix: true };
      },
    });
    return res.status(200).json(json);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}
