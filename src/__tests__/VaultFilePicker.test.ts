import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ modal: null as any, inline: null as any, inlineAvailable: false }));
vi.mock('obsidian', () => ({
  get AbstractInputSuggest() {
    return state.inlineAvailable ? class {
      constructor() { state.inline = this; }
      setValue = vi.fn();
      close = vi.fn();
    } : undefined;
  },
  FuzzySuggestModal: class {
    constructor(public app: unknown) { state.modal = this; }
    open = vi.fn();
  },
}));
import { attachVaultFilePicker } from '../VaultFilePicker';

it('offers a working file modal when the host has no AbstractInputSuggest', () => {
  const file = { path: 'Demo.md' };
  const callback = vi.fn();
  let click!: () => void;
  const button = { addEventListener: vi.fn((_name, fn) => { click = fn; }) };
  const container = { createEl: vi.fn(() => button) };
  const input = { parentElement: container, remove: vi.fn() };
  attachVaultFilePicker({ vault: { getMarkdownFiles: () => [file] } } as never, input as never, callback);
  expect(container.createEl).toHaveBeenCalledWith('button', expect.objectContaining({ text: 'Add context file…' }));
  expect(input.remove).toHaveBeenCalled();
  click();
  expect(state.modal.open).toHaveBeenCalled();
  expect(state.modal.getItems()).toEqual([file]);
  expect(state.modal.getItemText(file)).toBe('Demo.md');
  state.modal.onChooseItem(file);
  expect(callback).toHaveBeenCalledWith(file);
});

it('preserves inline filtering, rendering, and selection on Obsidian', () => {
  state.inlineAvailable = true;
  try {
    const files = Array.from({ length: 25 }, (_, index) => ({ path: `Notes/Demo${index}.md` }));
    const callback = vi.fn();
    const input = { remove: vi.fn() };
    attachVaultFilePicker({ vault: { getMarkdownFiles: () => files } } as never, input as never, callback);
    expect(input.remove).not.toHaveBeenCalled();
    expect(state.inline.getSuggestions('DEMO')).toEqual(files.slice(0, 20));
    expect(state.inline.getSuggestions('missing')).toEqual([]);
    const element = { createSpan: vi.fn() };
    state.inline.renderSuggestion(files[0], element);
    expect(element.createSpan).toHaveBeenCalledWith({ cls: 'voice-suggest-path', text: files[0].path });
    state.inline.selectSuggestion(files[0]);
    expect(callback).toHaveBeenCalledWith(files[0]);
    expect(state.inline.setValue).toHaveBeenCalledWith('');
    expect(state.inline.close).toHaveBeenCalled();
  } finally { state.inlineAvailable = false; }
});
