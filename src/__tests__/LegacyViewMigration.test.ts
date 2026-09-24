import { describe, expect, it, vi } from 'vitest';
import { migrateLegacyVoiceView } from '../LegacyViewMigration';

describe('legacy workspace view migration', () => {
  it('opens the new view before detaching legacy leaves', async () => {
    const events: string[] = [];
    const legacyLeaf = { detach: vi.fn(() => events.push('detach')) };
    const targetLeaf = {
      setViewState: vi.fn(async ({ type }: { type: string }) => { events.push(type); }),
    };
    const workspace = {
      getLeavesOfType: vi.fn((type: string) => type === 'obsidian-orchestrator:voice-panel' ? [legacyLeaf] : []),
      getRightLeaf: vi.fn(() => targetLeaf),
      getLeaf: vi.fn(),
      revealLeaf: vi.fn(),
    };

    await migrateLegacyVoiceView(workspace as never);

    expect(events).toEqual(['threads-orchestrator:voice-panel', 'detach']);
    expect(workspace.revealLeaf).toHaveBeenCalledWith(targetLeaf);
  });

  it('does nothing without a legacy view', async () => {
    const workspace = {
      getLeavesOfType: vi.fn(() => []),
      getRightLeaf: vi.fn(),
      getLeaf: vi.fn(),
      revealLeaf: vi.fn(),
    };

    await migrateLegacyVoiceView(workspace as never);

    expect(workspace.getRightLeaf).not.toHaveBeenCalled();
  });
});
