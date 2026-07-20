"use client";

import { useCallback, useEffect, useState } from "react";

import type { PartialRunArtifacts } from "@/features/artifacts/types";

export function useArtifactPanelState(params: {
  readonly artifacts: PartialRunArtifacts | null;
  readonly stackValidationFailed: boolean;
  readonly crossValidationFailed: boolean;
}) {
  const [panelArtifacts, setPanelArtifacts] = useState(params.artifacts);
  const [localStackValidationFailed, setLocalStackValidationFailed] = useState(
    params.stackValidationFailed,
  );
  const [localCrossValidationFailed, setLocalCrossValidationFailed] = useState(
    params.crossValidationFailed,
  );

  useEffect(() => {
    setPanelArtifacts(params.artifacts);
  }, [params.artifacts]);

  useEffect(() => {
    setLocalStackValidationFailed(params.stackValidationFailed);
    setLocalCrossValidationFailed(params.crossValidationFailed);
  }, [params.stackValidationFailed, params.crossValidationFailed]);

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
