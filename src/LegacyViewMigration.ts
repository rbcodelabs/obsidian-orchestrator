import type { Workspace, WorkspaceLeaf } from 'obsidian';
import {
  LEGACY_ORCHESTRATOR_VOICE_VIEW_TYPE,
  THREADS_ORCHESTRATOR_VOICE_VIEW_TYPE,
} from './PluginIdentity';

type MigratableWorkspace = Pick<Workspace, 'getLeavesOfType' | 'getRightLeaf' | 'getLeaf' | 'revealLeaf'>;

export async function migrateLegacyVoiceView(workspace: MigratableWorkspace): Promise<void> {
  const legacyLeaves = workspace.getLeavesOfType(LEGACY_ORCHESTRATOR_VOICE_VIEW_TYPE);
  if (legacyLeaves.length === 0) return;

  let targetLeaf: WorkspaceLeaf | null = workspace.getLeavesOfType(THREADS_ORCHESTRATOR_VOICE_VIEW_TYPE)[0] ?? null;
  if (!targetLeaf) {
    targetLeaf = workspace.getRightLeaf(false) ?? workspace.getLeaf('split', 'vertical');
    await targetLeaf.setViewState({ type: THREADS_ORCHESTRATOR_VOICE_VIEW_TYPE, active: true });
  }
  workspace.revealLeaf(targetLeaf);

  for (const leaf of legacyLeaves) leaf.detach();
}
