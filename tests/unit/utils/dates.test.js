import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateOnlyToDate,
  dateToDateOnly,
  getPeriodRange,
  isValidDateOnly,
  startOfLocalDay,
  toLocalDateString,
} from '../../../src/utils/dates.js';

const SP = 'America/Sao_Paulo';

describe('utils/dates', () => {
  it('calcula a data local da loja mesmo quando em UTC já é o dia seguinte', () => {
    // 01:30 UTC de 12/11 = 22:30 de 11/11 em São Paulo (UTC-3)
    expect(toLocalDateString(new Date('2026-11-12T01:30:00Z'), SP)).toBe('2026-11-11');
    expect(toLocalDateString(new Date('2026-11-12T03:00:00Z'), SP)).toBe('2026-11-12');
  });

  it('valida e converte datas no formato YYYY-MM-DD', () => {
    expect(isValidDateOnly('2026-02-28')).toBe(true);
    expect(isValidDateOnly('2026-02-30')).toBe(false);
    expect(isValidDateOnly('11/11/2026')).toBe(false);
    expect(dateToDateOnly(dateOnlyToDate('2026-11-11'))).toBe('2026-11-11');
    expect(() => dateOnlyToDate('2026-13-01')).toThrow(RangeError);
  });

  it('soma dias atravessando meses e anos', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('converte a meia-noite local para o instante UTC correto', () => {
    expect(startOfLocalDay('2026-11-11', SP).toISOString()).toBe('2026-11-11T03:00:00.000Z');
    expect(startOfLocalDay('2026-11-11', 'UTC').toISOString()).toBe('2026-11-11T00:00:00.000Z');
  });

  it('respeita o horário de verão em fusos que o adotam', () => {
    // Nova York: UTC-4 em julho (horário de verão) e UTC-5 em dezembro.
    expect(startOfLocalDay('2026-07-01', 'America/New_York').toISOString()).toBe(
      '2026-07-01T04:00:00.000Z',
    );
    expect(startOfLocalDay('2026-12-01', 'America/New_York').toISOString()).toBe(
      '2026-12-01T05:00:00.000Z',
    );
  });

  describe('getPeriodRange', () => {
    // Quarta-feira, 11/11/2026, 15:00 em São Paulo
    const now = new Date('2026-11-11T18:00:00Z');

    it('today: do início do dia local até o início do dia seguinte', () => {
      const range = getPeriodRange('today', SP, now);
      expect(range.startDate).toBe('2026-11-11');
      expect(range.from.toISOString()).toBe('2026-11-11T03:00:00.000Z');
      expect(range.to.toISOString()).toBe('2026-11-12T03:00:00.000Z');
    });

    it('week: de segunda a domingo da semana atual', () => {
      const range = getPeriodRange('week', SP, now);
      expect(range.startDate).toBe('2026-11-09');
      expect(range.endDate).toBe('2026-11-16');
    });

    it('week: domingo pertence à semana iniciada na segunda anterior', () => {
      const sunday = new Date('2026-11-15T18:00:00Z');
      expect(getPeriodRange('week', SP, sunday).startDate).toBe('2026-11-09');
    });

    it('month: do dia 1º até o primeiro dia do mês seguinte', () => {
      const range = getPeriodRange('month', SP, new Date('2026-12-20T12:00:00Z'));
      expect(range.startDate).toBe('2026-12-01');
      expect(range.endDate).toBe('2027-01-01');
    });

    it('rejeita períodos desconhecidos', () => {
      expect(() => getPeriodRange('year', SP, now)).toThrow(RangeError);
    });
  });
});
