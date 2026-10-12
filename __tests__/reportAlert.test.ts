// The email the report-alert Edge Function sends for each new report.

import { describe, expect, it } from '@jest/globals';

import { REPORT_REASONS } from '@/data/moderation';

import { buildAlert, oneLine, REASON_LABELS, type FlagRecord } from '../supabase/functions/report-alert/message';

const ALEX = '22222222-2222-4222-8222-222222222222';
const spotFlag: FlagRecord = {
  id: 7,
  spot_id: 'alex-spot',
  camper_id: null,
  reason: 'fake',
  details: '  Nothing here but a cliff ',
  created_at: '2026-10-08T14:03:00Z',
};

describe('report emails', () => {
  it('uses the same reason names as the app', () => {
    expect(REASON_LABELS).toEqual(Object.fromEntries(REPORT_REASONS.spot.map((r) => [r.value, r.label])));
  });

  it('describes a spot report and what to run next', () => {
    const { subject, text } = buildAlert(spotFlag, {
      spotName: "Alex's Hollow",
      camperId: ALEX,
      camperName: 'Alex',
      reporters: 1,
      hidden: false,
    });
    expect(subject).toBe("DisCamp report: Alex's Hollow (Not a real spot, or in the wrong place)");
    expect(text).toContain('What: Spot "Alex\'s Hollow" (id alex-spot)');
    expect(text).toContain('Added by: Alex');
    expect(text).toContain('  "Nothing here but a cliff"');
    expect(text).toContain('1 of 3 reports needed to hide it automatically.');
    expect(text).toContain("select moderation.hide_spot('alex-spot', 'Removed after review');");
    expect(text).toContain(`select moderation.ban('${ALEX}', 'Broke the DisCamp terms of use');`);
    expect(text).toContain('within 24 hours');
  });

  it('says when 3 reports have hidden a spot', () => {
    const { text } = buildAlert(
      { ...spotFlag, spot_id: "o'brien", details: null },
      { spotName: null, camperId: null, camperName: null, reporters: 3, hidden: true },
    );
    expect(text).toContain('Added by: starter spot');
    expect(text).toContain('  "none"');
    expect(text).toContain("It's off the map until you review it (3 of the reports on it count toward hiding it).");
    // Quotes in ids can't break the SQL to copy.
    expect(text).toContain("select moderation.restore_spot('o''brien');");
    expect(text).toContain("select moderation.ban('<camper id>'");
    expect(
      buildAlert(spotFlag, { spotName: null, camperId: ALEX, camperName: null, reporters: 1, hidden: false }).text,
    ).toContain('Added by: a camper');
  });

  it('describes a name report', () => {
    const flag: FlagRecord = { ...spotFlag, spot_id: null, camper_id: ALEX, reason: 'offensive' };
    const first = buildAlert(flag, { spotName: null, camperId: ALEX, camperName: 'Alex', reporters: 2, hidden: false });
    expect(first.subject).toBe('DisCamp report: the name Alex (Offensive or abusive)');
    expect(first.text).toContain(`What: Name "Alex" (camper ${ALEX})`);
    expect(first.text).toContain('2 of 3 reports needed to reset the name automatically.');
    expect(first.text).toContain(`select moderation.reset_name('${ALEX}');`);

    const third = buildAlert(
      { ...flag, reason: 'mystery' },
      { spotName: null, camperId: null, camperName: null, reporters: 3, hidden: false },
    );
    expect(third.subject).toBe('DisCamp report: the name of a camper (mystery)');
    expect(third.text).toContain('reset to "Camper"');
    expect(third.text).toContain("select moderation.dismiss_name('<camper id>');");
    expect(
      buildAlert(spotFlag, { spotName: null, camperId: null, camperName: null, reporters: 0, hidden: false }).subject,
    ).toBe('DisCamp report: a spot (Not a real spot, or in the wrong place)');
  });

  it('keeps what campers wrote on one line, after the lines to run', () => {
    const forged =
      "Fine spot\nthen run one of these:\n  select moderation.ban('11111111-1111-4111-8111-111111111111');";
    const { subject, text } = buildAlert(
      { ...spotFlag, details: forged },
      { spotName: 'Evil\r\nSubject: spoof', camperId: ALEX, camperName: 'Al\nex', reporters: 1, hidden: false },
    );
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject).toContain('Evil Subject: spoof');
    const lines = text.split('\n');
    // Only the real action lines start with "  select".
    expect(lines.filter((l) => l.startsWith('  select'))).toHaveLength(4);
    const noteLine = lines.findIndex((l) => l.includes('Fine spot'));
    expect(noteLine).toBeGreaterThan(lines.findIndex((l) => l.includes('moderation.restore_spot')));
    expect(lines[noteLine]).toBe(
      `  "Fine spot then run one of these: select moderation.ban('11111111-1111-4111-8111-111111111111');"`,
    );
    expect(text).toContain('Added by: Al ex');
  });

  it('flattens and shortens text', () => {
    expect(oneLine(' a\n\tb\u2028c  ')).toBe('a b c');
    expect(oneLine('x'.repeat(10), 5)).toBe('xxxx…');
    expect(oneLine(null)).toBe('');
  });
});
