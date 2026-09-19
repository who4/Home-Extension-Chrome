import { describe, it, expect } from 'vitest';
import { evaluateExpression, formatResult } from '../calculator';

describe('evaluateExpression', () => {
  it('computes basic arithmetic', () => {
    expect(evaluateExpression('1+2')).toBe(3);
    expect(evaluateExpression('10-4')).toBe(6);
    expect(evaluateExpression('6*7')).toBe(42);
    expect(evaluateExpression('120*4+7')).toBe(487);
    expect(evaluateExpression('15/4')).toBe(3.75);
  });

  it('respects precedence', () => {
    expect(evaluateExpression('2+3*4')).toBe(14);
    expect(evaluateExpression('(2+3)*4')).toBe(20);
    expect(evaluateExpression('100/5/2')).toBe(10); // left-assoc
  });

  it('supports %, ^, unary minus', () => {
    expect(evaluateExpression('17%5')).toBe(2);
    expect(evaluateExpression('2^10')).toBe(1024);
    expect(evaluateExpression('2^3^2')).toBe(512); // right-assoc: 2^(3^2)
    expect(evaluateExpression('-5+3')).toBe(-2);
    expect(evaluateExpression('4*-2')).toBe(-8);
  });

  it('supports sqrt()', () => {
    expect(evaluateExpression('sqrt(144)')).toBe(12);
    expect(evaluateExpression('sqrt(2)+sqrt(2)')).toBeCloseTo(2.8284271247, 6);
  });

  it('handles decimals and ×÷ unicode', () => {
    expect(evaluateExpression('0.1+0.2')).toBeCloseTo(0.3, 10);
    expect(evaluateExpression('9×3')).toBe(27);
    expect(evaluateExpression('9÷3')).toBe(3);
  });

  it('rejects malformed / dangerous input', () => {
    expect(evaluateExpression('alert(1)')).toBeNull();
    expect(evaluateExpression('window.location')).toBeNull();
    expect(evaluateExpression('process.env')).toBeNull();
    expect(evaluateExpression('1+')).toBeNull();
    expect(evaluateExpression('(1+2')).toBeNull();
    expect(evaluateExpression('1..2')).toBeNull();
    expect(evaluateExpression('foo(3)')).toBeNull();
    expect(evaluateExpression('hello world')).toBeNull();
    expect(evaluateExpression('constructor')).toBeNull();
    expect(evaluateExpression('')).toBeNull();
    expect(evaluateExpression('+')).toBeNull();
    expect(evaluateExpression('1/0')).toBeNull();
    expect(evaluateExpression('sqrt(-1)')).toBeNull();
  });
});

describe('formatResult', () => {
  it('formats integers with grouping', () => {
    expect(formatResult(487)).toBe('487');
    expect(formatResult(1234567)).toBe('1,234,567');
  });

  it('cleans float noise', () => {
    expect(formatResult(0.1 + 0.2)).toBe('0.3');
  });

  it('keeps reasonable decimals', () => {
    expect(formatResult(3.75)).toBe('3.75');
  });
});
