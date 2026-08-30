"use client";

import { useCallback, useState } from "react";

import type { PartialRunArtifacts } from "@/features/artifacts/types";

export function useArtifactPanelState(params: {
  readonly artifacts: PartialRunArtifacts | null;
  readonly stackValidationFailed: boolean;
  readonly crossValidationFailed: boolean;
}) {
  const [panelArtifacts, setPanelArtifacts] = useState(params.artifacts);
  const [previousArtifacts, setPreviousArtifacts] = useState(params.artifacts);
  if (previousArtifacts !== params.artifacts) {
    setPreviousArtifacts(params.artifacts);
    setPanelArtifacts(params.artifacts);
  }

  const [localStackValidationFailed, setLocalStackValidationFailed] = useState(
    params.stackValidationFailed,
  );
  const [localCrossValidationFailed, setLocalCrossValidationFailed] = useState(
    params.crossValidationFailed,
  );
  const [previousValidationFlags, setPreviousValidationFlags] = useState({
    stackValidationFailed: params.stackValidationFailed,
    crossValidationFailed: params.crossValidationFailed,
  });
  if (
    previousValidationFlags.stackValidationFailed !==
      params.stackValidationFailed ||
    previousValidationFlags.crossValidationFailed !==
      params.crossValidationFailed
  ) {
    setPreviousValidationFlags({
      stackValidationFailed: params.stackValidationFailed,
      crossValidationFailed: params.crossValidationFailed,
    });
    setLocalStackValidationFailed(params.stackValidationFailed);
    setLocalCrossValidationFailed(params.crossValidationFailed);
  }

  const handleBlueprintGenerated = useCallback(
    (
      generated: PartialRunArtifacts,
      validationFlags?: {
        stackValidationFailed: boolean;
        crossValidationFailed: boolean;
      },
    ) => {
      setPanelArtifacts((current) => ({ ...current, ...generated }));
      if (!validationFlags) {
        return;
      }
      setLocalStackValidationFailed(
        (current) => current || validationFlags.stackValidationFailed,
      );
      setLocalCrossValidationFailed(
        (current) => current || validationFlags.crossValidationFailed,
      );
    },
    [],
  );

  return {
    panelArtifacts,
    localStackValidationFailed,
    localCrossValidationFailed,
    handleBlueprintGenerated,
  };
}
