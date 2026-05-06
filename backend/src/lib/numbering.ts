// ============================================================
// Numérotation séquentielle (INT-2026-XXXX, ACC-2026-XXXX, ...)
// Utilise la table Sequence + transaction pour éviter les collisions
// ============================================================
import type { PrismaClient } from '@prisma/client';

const PREFIX: Record<string, string> = {
  ticket:     'INT',
  accident:   'ACC',
  derogation: 'DER',
  chantier:   'CHA',
  bulletin:   'NZI',
};

export async function nextNumber(prisma: PrismaClient, key: keyof typeof PREFIX): Promise<string> {
  const year = new Date().getFullYear();
  // Transaction : lit-incrémente atomiquement la séquence pour ce key
  const seq = await prisma.$transaction(async (tx) => {
    const cur = await tx.sequence.findUnique({ where: { key } });
    if (!cur || cur.year !== year) {
      // Reset annuel
      return tx.sequence.upsert({
        where: { key },
        update: { year, value: 1 },
        create: { key, year, value: 1 },
      });
    }
    return tx.sequence.update({
      where: { key },
      data: { value: { increment: 1 } },
    });
  });
  const padded = String(seq.value).padStart(4, '0');
  return `${PREFIX[key]}-${year}-${padded}`;
}
