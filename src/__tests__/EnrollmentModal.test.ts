import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
vi.mock('obsidian', () => ({ Modal: class {
  contentEl = { empty: vi.fn(), createEl: vi.fn(() => ({ textContent: '', addEventListener: vi.fn() })) };
} }));
vi.mock('../WakeWordDetector', () => ({ WakeWordDetector: class {
  startEnrollment = state.start;
  stopEnrollment = state.stop;
} }));
import { EnrollmentModal } from '../EnrollmentModal';
beforeEach(() => vi.clearAllMocks());

it('reports startup failure without misdiagnosing model errors as microphone denial', async () => {
  state.start.mockRejectedValue(new Error('backend unavailable'));
  const plugin = {
    app: { vault: { adapter: { basePath: '/synthetic' } } },
    manifest: { dir: 'plugin' }, settings: {}, suspendWakeDetector: vi.fn(),
  };
  const modal = new EnrollmentModal({} as never, plugin as never);
  await (modal as unknown as { runEnrollment(): Promise<void> }).runEnrollment();
  expect(modal.contentEl.createEl).toHaveBeenLastCalledWith('p', {
    text: 'Could not start wake-word calibration: Error: backend unavailable', cls: 'voice-enroll-error',
  });
  expect(state.stop).toHaveBeenCalled();
});

it('stops audio that finishes starting after the calibration modal was closed', async () => {
  let finish!: () => void;
  state.start.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  const plugin = {
    app: { vault: { adapter: { basePath: '/synthetic' } } },
    manifest: { dir: 'plugin' }, settings: {}, suspendWakeDetector: vi.fn(), resumeWakeDetector: vi.fn(),
  };
  const modal = new EnrollmentModal({} as never, plugin as never);
  const starting = (modal as unknown as { runEnrollment(): Promise<void> }).runEnrollment();
  modal.onClose();
  expect(state.stop).toHaveBeenCalledTimes(1);
  finish();
  await starting;
  expect(state.stop).toHaveBeenCalledTimes(2);
});
