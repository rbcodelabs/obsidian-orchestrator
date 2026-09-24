import { describe, expect, it } from 'vitest';
import { lifecycleInstructions, lifecycleLabel, lifecycleResult } from '../ThreadLifecyclePresentation';

describe('thread lifecycle presentation', () => {
  it('advertises only available operations and requires discovered exact IDs', () => {
    expect(lifecycleInstructions(new Set())).toBe('');
    const prompt = lifecycleInstructions(new Set(['ct_archive_thread']));
    expect(prompt).toContain('ct_archive_thread');
    expect(prompt).not.toContain('ct_mark_reviewed');
    expect(prompt).toContain('exact thread IDs');
    expect(prompt).toContain('clarify');
    expect(prompt).toContain('host confirmation dialog');
  });
  it('labels both actions with their target', () => {
    expect(lifecycleLabel('ct_archive_thread', { thread_id: 'thread-1' })).toContain('Archiving thread');
    expect(lifecycleLabel('ct_mark_reviewed', { thread_id: 'thread-1' })).toContain('Marking reviewed');
  });
  it('distinguishes archive cancellation, failure, and success', () => {
    expect(lifecycleResult('ct_archive_thread', 'Archive cancelled for thread t1.')).toBe('Archive cancelled for thread t1.');
    expect(lifecycleResult('ct_archive_thread', 'Error: disk full')).toBe('Error: disk full');
    expect(lifecycleResult('ct_archive_thread', 'Archived thread t1.')).toBe('Archived thread t1.');
    expect(lifecycleResult('ct_archive_thread', 'Unknown outcome')).toBe('Unknown outcome');
  });
  it('preserves idempotent review outcomes and errors', () => {
    expect(lifecycleResult('ct_mark_reviewed', 'Thread t1 is already reviewed.')).toBe('Thread t1 is already reviewed.');
    expect(lifecycleResult('ct_mark_reviewed', 'Marked thread t1 reviewed.')).toBe('Marked thread t1 reviewed.');
    expect(lifecycleResult('ct_mark_reviewed', 'Error: running')).toBe('Error: running');
  });
});
