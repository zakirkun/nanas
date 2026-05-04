import { describe, expect, it } from 'vitest';
import { computeFunctionStatus } from './status';
import type { FunctionListItem } from './queries';

function row(partial: Partial<FunctionListItem>): FunctionListItem {
  return {
    id: 'x',
    name: 'fn',
    triggers_count: 0,
    entrypoint_enabled: false,
    created_at: new Date().toISOString(),
    ...partial,
  };
}

describe('computeFunctionStatus', () => {
  it('marks failed deployment', () => {
    expect(computeFunctionStatus(row({ last_deployment_status: 'failed' }))).toBe('failed');
  });

  it('marks active deployment', () => {
    expect(computeFunctionStatus(row({ last_deployment_status: 'active' }))).toBe('active');
  });

  it('defaults to draft when only version exists', () => {
    expect(computeFunctionStatus(row({ current_version: '1.0.0' }))).toBe('draft');
  });
});
