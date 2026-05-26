export type RegenerateArtifactsActionState = {
  success: boolean;
  error?: string;
};

export const regenerateArtifactsInitialState: RegenerateArtifactsActionState = {
  success: false,
};
