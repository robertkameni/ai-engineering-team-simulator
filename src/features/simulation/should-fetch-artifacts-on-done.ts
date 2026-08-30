/**
 * `all_artifacts_complete` already loads the panel. Repeating that GET on
 * `done` doubles the artifacts request (and used to look like a 404 storm
 * when an earlier run id was still being polled). Skip the second fetch
 * unless synthesis timed out and we still need to poll.
 */
export function shouldFetchArtifactsOnDone(input: {
  readonly artifactTimeout: boolean | undefined;
  readonly alreadyFetchedViaStream: boolean;
}): boolean {
  if (input.artifactTimeout === true) {
    return true;
  }
  return !input.alreadyFetchedViaStream;
}
