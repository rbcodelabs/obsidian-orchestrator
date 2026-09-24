export function lifecycleInstructions(names: ReadonlySet<string>): string {
  const operations: string[] = [];
  if (names.has('ct_archive_thread')) operations.push('Use ct_archive_thread to archive a requested thread. Running threads and orchestrators require an actual host confirmation dialog; never invent or bypass confirmation.');
  if (names.has('ct_mark_reviewed')) operations.push('Use ct_mark_reviewed to mark an idle thread reviewed without opening it.');
  if (!operations.length) return '';
  return '\n\nThread lifecycle: ' + operations.join(' ') +
    ' Use exact thread IDs from ct_list_threads; clarify ambiguous title matches before acting.' +
    ' An explicit user request authorizes an ordinary lifecycle action. Do not archive or mark reviewed merely because work finished.' +
    ' Report the returned outcome truthfully; cancellation and errors are not success.';
}

export function lifecycleLabel(name: string, args: Record<string, unknown>): string | undefined {
  const id = String(args.thread_id ?? '').slice(0, 8);
  if (name === 'ct_archive_thread') return `Archiving thread · ${id}…`;
  if (name === 'ct_mark_reviewed') return `Marking reviewed · ${id}…`;
  return undefined;
}

export function lifecycleResult(name: string, result: string): string | undefined {
  // Keep the exact target and failure/cancellation reason in the transcript.
  if (name === 'ct_archive_thread' || name === 'ct_mark_reviewed') return result;
  return undefined;
}
