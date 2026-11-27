import { head, del } from '@vercel/blob';

const MAX_TOTAL = 100 * 1024 * 1024; // 100 Mo au total par demande
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  const b = req.body || {};
  if (b.website) return res.status(200).json({ ok: true }); // champ piège anti-robots

  const name = String(b.name || '').trim().slice(0, 120);
  const phone = String(b.phone || '').trim().slice(0, 40);
  const email = String(b.email || '').trim().slice(0, 160);
  if (!name || !phone || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Coordonnées incomplètes.' });

  const input = Array.isArray(b.files) ? b.files.slice(0, 10) : [];
  if (!input.length) return res.status(400).json({ error: 'Aucun fichier reçu.' });

  // Vérifie chaque fichier et calcule la taille totale côté serveur
  let total = 0;
  const files = [];
  try {
    for (const f of input) {
      const u = new URL(f.url);
      if (   !u.hostname.endsWith('.private.blob.vercel-storage.com') ||   !u.pathname.startsWith('/demandes/') ) {   throw new Error('bad'); }
      const info = await head(f.url);
      total += info.size;
      files.push({ name: String(f.name || info.pathname).slice(0, 200), url: info.url, downloadUrl: info.downloadUrl, size: info.size });
    }
  } catch {
    return res.status(400).json({ error: 'Fichiers invalides.' });
  }
  if (total > MAX_TOTAL) {
    await del(files.map((f) => f.url)).catch(() => {});
    return res.status(400).json({ error: 'Le total des fichiers dépasse 100 Mo.' });
  }

  const mo = (n) => (n / 1048576).toFixed(2) + ' Mo';
  const html = `
    <h2>Nouvelle demande — MadaRC3D</h2>
    <p><b>${esc(name)}</b><br>Tél. : ${esc(phone)}<br>E-mail : ${esc(email)}</p>
    <p>Matériau : ${esc(b.material || 'à confirmer')}<br>Quantité : ${esc(b.quantity)}<br>Couleur : ${esc(b.color || '—')}</p>
    <p>Précisions : ${esc(b.notes || '—')}</p>
    <h3>Fichiers (${files.length}, ${mo(total)})</h3>
    <ul>${files.map((f) => `<li><a href="${esc(f.downloadUrl)}">${esc(f.name)}</a> — ${mo(f.size)}</li>`).join('')}</ul>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || 'MadaRC3D <onboarding@resend.dev>',
      to: [process.env.MAIL_TO],
      reply_to: email,
      subject: `Demande de devis — ${name} (${files.length} fichier${files.length > 1 ? 's' : ''})`,
      html,
    }),
  });
 const resendResult = await r.json().catch(() => ({}));

if (!r.ok) {
  console.error('Erreur Resend:', resendResult);
  return res.status(502).json({
    error: 'Échec Resend. Consultez les logs Vercel.'
  });
}

console.log('E-mail envoyé:', resendResult);
  return res.status(200).json({ ok: true });
}
