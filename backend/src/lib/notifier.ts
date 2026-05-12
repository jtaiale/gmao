// ============================================================
// Notifier — envoie un mail à chaque destinataire pour un événement
// donné en consultant la table NotificationRule.
//
// Configuration SMTP via env :
//   SMTP_HOST, SMTP_PORT (def. 587), SMTP_SECURE (true|false)
//   SMTP_USER, SMTP_PASS
//   SMTP_FROM (def. "GMAO ARGOS <no-reply@argos-oi.re>")
// Si SMTP_HOST n'est pas défini → les envois sont seulement loggés.
// ============================================================
import type { PrismaClient } from '@prisma/client';

export const NOTIFICATION_EVENTS = [
  { key: 'ticket_created',       label: 'Nouveau ticket créé' },
  { key: 'ticket_completed',     label: 'Ticket résolu / clôturé' },
  { key: 'accident_created',     label: 'Nouveau presque-accident' },
  { key: 'derogation_created',   label: 'Nouvelle demande de dérogation' },
  { key: 'derogation_validated', label: 'Dérogation validée' },
  { key: 'bulletin_published',   label: 'Bulletin NOUT ZINFOS publié' },
] as const;
export type NotificationEvent = typeof NOTIFICATION_EVENTS[number]['key'];

let _transporter: any = null;
async function getTransporter() {
  if (_transporter !== null) return _transporter;
  if (!process.env.SMTP_HOST) {
    _transporter = false; // signale qu'on n'a pas de SMTP : on logguera seulement
    return _transporter;
  }
  try {
    const nodemailer = await import('nodemailer');
    _transporter = nodemailer.default.createTransport({
      host:   process.env.SMTP_HOST,
      port:   Number(process.env.SMTP_PORT) || 587,
      secure: /^(1|true|yes)$/i.test(process.env.SMTP_SECURE || ''),
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS || '',
      } : undefined,
    });
    return _transporter;
  } catch (e) {
    console.warn('[notifier] nodemailer indisponible — mails désactivés :', (e as any)?.message);
    _transporter = false;
    return _transporter;
  }
}

async function sendMail(to: string, subject: string, html: string) {
  const t = await getTransporter();
  if (!t) {
    console.log(`[notifier] (no SMTP) → mail simulé pour ${to} : ${subject}`);
    return { ok: true, error: null };
  }
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || 'GMAO ARGOS <no-reply@argos-oi.re>',
      to, subject, html,
    });
    return { ok: true, error: null };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Émet un événement : trouve toutes les règles actives pour cet event,
 * résout l'adresse, envoie, enregistre dans NotificationLog. Non-bloquant.
 */
export function emit(prisma: PrismaClient, event: NotificationEvent, payload: {
  subject: string;
  bodyHtml: string;
}) {
  (async () => {
    try {
      const rules = await prisma.notificationRule.findMany({ where: { event, active: true } });
      if (rules.length === 0) return;
      for (const r of rules) {
        let to: string | null = null;
        if (r.recipientType === 'email' && r.email) to = r.email;
        if (r.recipientType === 'user' && r.userId) {
          const u = await prisma.user.findUnique({ where: { id: r.userId } });
          to = u?.email || null;
        }
        if (!to) continue;
        const res = await sendMail(to, payload.subject, payload.bodyHtml);
        await prisma.notificationLog.create({ data: {
          event, recipient: to, subject: payload.subject,
          ok: res.ok, errorMessage: res.error,
        }}).catch(() => {});
      }
    } catch (e) {
      console.warn('[notifier] emit failed', (e as any)?.message);
    }
  })();
}

export function html(title: string, lines: string[], linkUrl?: string, linkLabel?: string) {
  const body = lines.map(l => `<p style="margin:6px 0">${l}</p>`).join('\n');
  const link = linkUrl ? `<p style="margin:14px 0"><a href="${linkUrl}" style="background:#1f769e;color:#fff;text-decoration:none;padding:8px 14px;border-radius:6px;display:inline-block">${linkLabel || 'Ouvrir dans la GMAO'}</a></p>` : '';
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#1a2332;max-width:560px;margin:0 auto;padding:16px">
    <h2 style="color:#1f769e;border-bottom:2px solid #1f769e;padding-bottom:6px">${title}</h2>
    ${body}
    ${link}
    <p style="font-size:11px;color:#8a98a5;margin-top:24px">GMAO ARGOS OCEAN INDIEN — message automatique</p>
  </body></html>`;
}
