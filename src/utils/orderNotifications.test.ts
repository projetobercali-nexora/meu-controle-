import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  filterMissedOrdersSince,
  markAllNotificationItemsRead,
  markNotificationItemRead,
  MAX_STORED_NOTIFICATIONS,
  mergeIncomingOrderNotifications,
  NOTIFICATION_MELODIES,
  OrderNotificationItem,
  sanitizeNotificationPreferences,
} from './orderNotifications';

test('NOTIFICATION_MELODIES exposes the exact 5 melodies requested in Portuguese', () => {
  assert.equal(NOTIFICATION_MELODIES.length, 5);
  assert.deepEqual(
    NOTIFICATION_MELODIES.map((m) => m.label),
    ['Sino clássico', 'Caixa registadora', 'Suave', 'Alerta duplo', 'Marimba']
  );
});

test('sanitizeNotificationPreferences clamps volume 0..100 and validates melody IDs', () => {
  assert.deepEqual(sanitizeNotificationPreferences(null), DEFAULT_NOTIFICATION_PREFERENCES);
  assert.deepEqual(sanitizeNotificationPreferences('invalid'), DEFAULT_NOTIFICATION_PREFERENCES);

  const clampedHigh = sanitizeNotificationPreferences({
    enabled: false,
    soundEnabled: true,
    volume: 145.6,
    melody: 'marimba',
  });
  assert.equal(clampedHigh.enabled, false);
  assert.equal(clampedHigh.soundEnabled, true);
  assert.equal(clampedHigh.volume, 100);
  assert.equal(clampedHigh.melody, 'marimba');

  const clampedLowAndInvalidMelody = sanitizeNotificationPreferences({
    enabled: true,
    soundEnabled: false,
    volume: -25,
    melody: 'unknown_sound',
  });
  assert.equal(clampedLowAndInvalidMelody.volume, 0);
  assert.equal(clampedLowAndInvalidMelody.melody, 'classic_bell');
  assert.equal(clampedLowAndInvalidMelody.soundEnabled, false);
});

test('mergeIncomingOrderNotifications deduplicates real orders, orders newest-first, and isolates test notifications', () => {
  const existing: OrderNotificationItem[] = [
    {
      id: 'ord-notif-o1',
      orderId: 'o1',
      orderCode: 'BRC-2026-0001',
      customerName: 'Ana Silva',
      totalKz: 25000,
      origin: 'website',
      createdAt: '2026-10-28T10:00:00.000Z',
      receivedAt: '2026-10-28T10:00:01.000Z',
      read: true,
    },
  ];

  const merged = mergeIncomingOrderNotifications(
    existing,
    ['o0'],
    [
      // Duplicate of o1 -> must be ignored
      {
        id: 'o1',
        code: 'BRC-2026-0001',
        customerName: 'Ana Silva',
        totalKz: 25000,
        origin: 'website',
        createdAt: '2026-10-28T10:00:00.000Z',
      },
      // Duplicate from notifiedOrderIds -> must be ignored
      {
        id: 'o0',
        code: 'BRC-2026-0000',
        customerName: 'Pedro Costa',
        totalKz: 18000,
        origin: 'whatsapp_store',
        createdAt: '2026-10-28T09:00:00.000Z',
      },
      // New real order o2
      {
        id: 'o2',
        code: 'BRC-2026-0002',
        customerName: 'Carlos Neto',
        totalKz: 42000,
        origin: 'website',
        createdAt: '2026-10-28T10:05:00.000Z',
      },
      // New real order o3 (arrived after o2)
      {
        id: 'o3',
        code: 'BRC-2026-0003',
        customerName: 'Marta Lopes',
        totalKz: 60000,
        origin: 'whatsapp_store',
        createdAt: '2026-10-28T10:06:00.000Z',
      },
    ],
    '2026-10-28T10:06:05.000Z'
  );

  assert.equal(merged.newlyAdded.length, 2);
  assert.equal(merged.nextList.length, 3);
  // Newest first in bell center: o3, then o2, then o1
  assert.deepEqual(
    merged.nextList.map((n) => n.orderId),
    ['o3', 'o2', 'o1']
  );
  assert.equal(merged.nextList[0].read, false);
  assert.equal(merged.nextList[2].read, true);
  assert.ok(merged.nextNotifiedIds.includes('o2'));
  assert.ok(merged.nextNotifiedIds.includes('o3'));

  // Test notification should be added without polluting nextNotifiedIds
  const withTest = mergeIncomingOrderNotifications(
    merged.nextList,
    merged.nextNotifiedIds,
    [
      {
        id: '999999',
        code: 'BRC-2026-TESTE',
        customerName: 'Cliente de Demonstração (Teste)',
        totalKz: 45000,
        origin: 'website',
        createdAt: '2026-10-28T10:07:00.000Z',
        isTest: true,
      },
    ],
    '2026-10-28T10:07:00.000Z'
  );

  assert.equal(withTest.newlyAdded.length, 1);
  assert.equal(withTest.nextList[0].isTest, true);
  assert.equal(withTest.nextNotifiedIds.includes('999999'), false);
});

test('mergeIncomingOrderNotifications caps stored list at MAX_STORED_NOTIFICATIONS', () => {
  const bulkIncoming = Array.from({ length: MAX_STORED_NOTIFICATIONS + 12 }, (_, idx) => ({
    id: `ord-${idx + 1}`,
    code: `BRC-${idx + 1}`,
    customerName: `Cliente ${idx + 1}`,
    totalKz: 10000,
    origin: 'website',
    createdAt: '2026-10-28T11:00:00.000Z',
  }));

  const merged = mergeIncomingOrderNotifications([], [], bulkIncoming);
  assert.equal(merged.nextList.length, MAX_STORED_NOTIFICATIONS);
  assert.equal(merged.nextList[0].orderId, `ord-${MAX_STORED_NOTIFICATIONS + 12}`);
});

test('markNotificationItemRead and markAllNotificationItemsRead update read flags immutably', () => {
  const sample: OrderNotificationItem[] = [
    {
      id: 'n1',
      orderId: 'o1',
      orderCode: 'BRC-1',
      customerName: 'A',
      totalKz: 1000,
      origin: 'website',
      createdAt: '2026-10-28T10:00:00.000Z',
      receivedAt: '2026-10-28T10:00:00.000Z',
      read: false,
    },
    {
      id: 'n2',
      orderId: 'o2',
      orderCode: 'BRC-2',
      customerName: 'B',
      totalKz: 2000,
      origin: 'website',
      createdAt: '2026-10-28T10:01:00.000Z',
      receivedAt: '2026-10-28T10:01:00.000Z',
      read: false,
    },
  ];

  const oneRead = markNotificationItemRead(sample, 'n1');
  assert.equal(oneRead[0].read, true);
  assert.equal(oneRead[1].read, false);
  assert.equal(sample[0].read, false);

  const allRead = markAllNotificationItemsRead(oneRead);
  assert.equal(allRead.every((n) => n.read), true);
});

test('filterMissedOrdersSince returns unseen orders strictly after sinceIso sorted chronologically', () => {
  const sinceIso = '2026-10-28T12:00:00.000Z';
  const rows = [
    { id: 'old-equal', createdAt: '2026-10-28T12:00:00.000Z' },
    { id: 'already-seen', createdAt: '2026-10-28T12:05:00.000Z' },
    { id: 'missed-second', createdAt: '2026-10-28T12:10:00.000Z' },
    { id: 'missed-first', createdAt: '2026-10-28T12:02:00.000Z' },
  ];

  const missed = filterMissedOrdersSince(rows, sinceIso, ['already-seen']);
  assert.deepEqual(
    missed.map((r) => r.id),
    ['missed-first', 'missed-second']
  );

  assert.deepEqual(filterMissedOrdersSince(rows, 'not-a-date', []), []);
});
