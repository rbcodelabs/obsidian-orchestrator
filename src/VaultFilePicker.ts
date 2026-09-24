import { AbstractInputSuggest, FuzzySuggestModal, type App, type TFile } from 'obsidian';

export function attachVaultFilePicker(app: App, input: HTMLInputElement, onSelect: (file: TFile) => void): void {
  // Some compatible hosts implement modal suggestions but not inline suggestions.
  const InlineSuggest = AbstractInputSuggest;
  if (typeof InlineSuggest === 'function') {
    class FileSuggest extends InlineSuggest<TFile> {
      getSuggestions(query: string): TFile[] {
        return app.vault.getMarkdownFiles()
          .filter(file => file.path.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 20);
      }
      renderSuggestion(file: TFile, el: HTMLElement): void {
        el.createSpan({ cls: 'voice-suggest-path', text: file.path });
      }
      selectSuggestion(file: TFile): void {
        onSelect(file);
        this.setValue('');
        this.close();
      }
    }
    new FileSuggest(app, input);
    return;
  }

  class FileModal extends FuzzySuggestModal<TFile> {
    getItems(): TFile[] { return app.vault.getMarkdownFiles(); }
    getItemText(file: TFile): string { return file.path; }
    onChooseItem(file: TFile): void { onSelect(file); }
  }
  const button = input.parentElement!.createEl('button', { text: 'Add context file…', type: 'button' });
  input.remove();
  button.addEventListener('click', () => new FileModal(app).open());
}
